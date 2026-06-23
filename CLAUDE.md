# CLAUDE.md — Bulletproof Training App

Project context for building Sohan's personal dynamic training system. Read this first.

## What this is
A personal, data-driven dynamic training system. Every morning it ingests recovery data + recent training history and produces **two outputs**: (1) a summary of yesterday, and (2) a recommendation for today's optimal session (gym upper/lower, pickleball, run, mobility, or rest) — with demo-video links for complex movements and target rep ranges. Built for Sohan first, but the data model is designed so multi-user is a later *addition*, not a rewrite. Philosophy/voice: Bryan Johnson / Blueprint — measured, optimal, evidence-based, "bulletproof" total-body health. Secondary purpose: it's a public portfolio piece that doubles as SE/FDE job-search proof ("built an Oura-integrated training engine").

## The athlete (Sohan)
- **Core goal:** "bulletproof" body — move and lift pain-free; total-body resilience; strong AND mobile AND lean; visible abs = his personal aesthetic bar.
- **Activities/passions:** strength training; pickleball (~2x/week, 2–3 hrs, his most strenuous activity); running (currently ~1x/week ~30 min, wants more). Gym ~4x/week, upper/lower split, ~1 hr/session incl. warmup + core.
- **Schedule:** one flexible rest day/week (flexes with pickleball or running). Prefers evening lifting.
- **Training preferences:** science-backed, compound-based, max results in minimum time; whole-body (wrists, lower back, knees — not just core/legs/chest); plyometrics included; mobility/flexibility emphasized heavily.
- **Injuries / pain points (these drive the mobility programming):**
  1. **Neck** — chronic stiffness/tightness, "always hurting." Root cause treated as **thoracic spine**, not the neck itself.
  2. **Ankles** — both injured over ~1.5 yrs; pain returns under high volume. Highest reinjury risk (lateral pickleball movement).
  3. **Hips & hamstrings** — wants better mobility: deep squat, down dog, flexibility poses.
  4. **Right-side dominance** — right arm stronger + tighter/less mobile than left.
- **Physique status:** already lean. Goal = slight recomposition + fill out shoulders/upper back + sharpen abs (not a bulk).

## The v1 program (knowledge base — the engine selects/serves from this)
**Weekly skeleton (flexible, readiness-modulated):** Mon/Wed/Fri gym (upper/lower, optimal ~5:30–7pm), Thursday run + dedicated mobility, pickleball ~2x, one flexible rest day.

**Non-negotiables (the high-leverage core):**
- **Thursday deep mobility session (~35–40 min)** — where the specific issues actually get fixed (everything else maintains/builds; Thursday fixes). Four blocks: **Neck** (chin tucks; thoracic extension on foam roller; levator scapulae stretch), **Ankle** (banded ankle distraction; wall ankle test — track knee-to-wall weekly; single-leg balance eyes closed), **Hips/Hamstrings** (90/90 ~3 min/side; PNF hamstring stretch; couch stretch; deep squat hold ~5 min), **Down dog + right shoulder** (down dog progression; sleeper stretch right; shoulder CARs). Long holds (60–120s) + PNF — restorative, distinct in intent/depth from the pre-lift warmup.
- **Nordic hamstring curl** — every lower day; strongest evidence base for hamstring injury prevention.
- **ATG split squat** — every lower day; ankle resilience.
- **Unilateral work starting with the LEFT side** — closes right-arm dominance over ~8–12 weeks if consistent.
- **5-min ankle warmup before EVERY pickleball session** — single highest-leverage injury-prevention habit given ankle history.
- Also flagged: Copenhagen plank (adductors/groin), Jefferson curl (spine/hamstrings), plyometrics.

**Diet (supports recomposition + recovery):** ~175g protein / ~200g carbs / ~70g fat / ~2,100 cal, timed around evening lifting (sample schedule 7:30am–9pm with per-meal macros). Pickleball days: +carbs (don't undereat the 600–800 cal burn). Rest days: ↓carbs, hold protein. South Asian angle: dal and cheela as anti-inflammatory, high-protein staples.

## System architecture (decided)
Two layers: **the data model is permanent; the engine and interface are disposable.** Design the schema right once, then rebuild UI / swap logic (rules → AI) without migrating data.

### Data model (get this right once)
- `sessions` — date, type (`upper_a`/`upper_b`/`lower_a`/`lower_b`/`pickleball`/`run`/`rest`/`mobility`), duration, optional exercises+sets+reps+weight, notes
- `recovery` — date, sleep_hrs, hrv, resting_hr, subjective_readiness (1–10), soreness_flags (neck/ankle/hips/shoulders/legs)
- `exercises` — name, pattern, demo_video_url, is_complex (static lookup, built once)
- `user` — profile + injury constraints (a table even though it's just Sohan, so multi-user = adding rows, not a rewrite)

### Engine (deterministic scoring — NOT an LLM freestyle)
For each candidate in [upper, lower, pickleball, run, rest, mobility]:
- base score from program rotation
- readiness ≤ 3 — force rest/mobility (gate everything else)
- no rest day in last 7 — heavy weight to rest
- no mobility session in last 4 days — weight to mobility (protects the specific issues)
- same pattern as yesterday — heavy penalty (the upper↔lower rule)
- pickleball requires: weather_good AND days_since_pickleball ≥ 2 AND readiness ≥ 6
- run AND pickleball was yesterday — +weight (legs worked, aerobic fits)
- run — respect 10%/week progression cap
- balance against ~10-day target ratios (~4 lift / 2 pickleball / 1–2 run / 1 rest)
- pick highest score, return top 2 (show the runner-up)

Weights are **tunable variables / opinions** — tune them against real last-30-days history before investing in UI. The **LLM layer is optional and sits on top**: it writes the natural-language summary + recommendation rationale and pulls exercise links. Language, not decisions. Cache aggressively (per-user cost matters at multi-user).

### Key unlock: Oura
Oura auto-delivers the entire `recovery` table every morning (sleep, HRV, resting HR, readiness) with **zero friction** — the hardest, most decision-relevant data is solved automatically. Pickleball/runs may auto-detect as Oura workouts. Only **gym training** still needs manual logging.

### Build stack (decided this session)
- **Python engine** (Oura pull + readiness scoring + program generation), runs each morning.
- **Public web app on Sohan's personal site** = the renderer (and a shareable portfolio piece).
- **Public/private split:** publish the program + the reasoning; keep raw biometrics (HRV etc.) private or aggregated.
- **Storage:** lean toward managed **Postgres (Supabase) with row-level security from day one** (multi-user-ready, no throwaway work) vs. a lighter SQLite/JSON start (faster, migrate later).
- **Recommended sequence:** prototype the scoring logic in a Sheet against last-30-days history to tune the weights (cheap way to learn whether "optimal" feels optimal), THEN build the app. Don't build UI around untuned logic.

## Open decisions (NOT yet settled — resolve before/while building)
1. **Logging model:** recommend-only (keep logging gym work in Strong/Hevy) vs. **app-becomes-the-logger** (owns history — enables rep/weight progressive-overload suggestions, removes Strong-API dependency). Current lean: eventually the logger; could start recommend-only to ship faster. **Sub-question that drives the design:** how much does Sohan want to log in-the-moment — full sets/reps/weight, or just "did upper, felt 7/10"?
2. **Storage/runtime:** Supabase + RLS once (no throwaway) vs. SQLite/JSON quick start.
3. **Rotation granularity:** maintain `upper_a`/`upper_b` + `lower_a`/`lower_b` variants so identical sessions don't repeat.

## Principles / guardrails
- **Friction-first:** if daily data-in takes >~20s, it dies. Optimize data-in before intelligence. (Oura largely solves recovery.)
- Data model permanent; engine + UI disposable/rebuildable.
- **Rules-based engine first** — transparent, debuggable, free, tunable (Sohan is a data analyst). ML only after months of logged data.
- The **readiness gate doubles as the injury guardrail** (neck/ankle history) — when readiness tanks, it forces rest/mobility.
- Multi-user is a later addition: design the schema for it (user table, RLS) but don't build it yet. Health data — even friends' sleep/HRV — is sensitive; RLS from the start, not bolted on.
- **"High-impact only":** cap junk volume; compound-based; science-backed exercise selection.

## To verify at build time (do NOT assert as current fact)
- **Strong/Hevy write API:** last known = Strong has no public write API (CSV export only). Verify when reaching the logging/integration phase.
- ~~**Oura API specifics** (endpoints, auth, token scopes) — confirm at build time.~~ **Confirmed in Phase 2** (see `docs/superpowers/plans/2026-06-21-phase2-weight-tuning.md` Global Constraints): base URL `https://api.ouraring.com/v2/usercollection`, Bearer-token PAT auth (not OAuth2), `start_date`/`end_date` query params, `next_token` pagination. Readiness score is **0-100** (not the 1-10 this doc originally assumed for `subjective_readiness`) — rescaled via `max(1, min(10, round(score / 10)))` when written to the existing column rather than changing the schema. Oura genuinely auto-detects `pickleball` and `running` as named workout activities, though pickleball detection looks under-frequent relative to actual play frequency (26 instances over ~22 months of real data) — worth a second look once more data accumulates.

## Status
All 6 planned phases are complete and merged to `master` as of 2026-06-23 — see `docs/superpowers/reports/autonomous-build-log.md` for the full per-phase log. The system now runs end to end: a GitHub Actions cron job runs the production engine (`engine/`) every morning at 11:00 UTC, pulling real Oura readiness and writing a real recommendation row to Supabase with zero manual intervention. The iPhone app (Expo/React Native, in TestFlight) signs in with Apple, syncs Apple Watch workouts from HealthKit into the same `activity` table, and shows today's recommendation plus yesterday's summary on its home screen. A public web dashboard at `https://smadimsetty.github.io/bulletproof/` shows the same two outputs to anyone with the link, no login required. Both clients read only a public-safe Postgres view — raw biometrics (HRV, the internal readiness number) stay private. Full Oura history (2024-08-21 to present) is live in Supabase's `recovery` + `activity` tables; reconstructed session history (665 days) is live in `sessions`.

**One open item, needs Sohan directly:** confirming HealthKit sync and Apple sign-in on a real iPhone. This needs an authenticated Apple Developer/EAS session and an interactive `eas build --platform ios --profile preview` — it can't be run non-interactively, so it's the one piece of this system nobody but Sohan can verify. Everything else has shipped and been independently verified live (not just in tests).

**Next up:** whatever Sohan wants to build next — there is no more pre-planned backlog. Natural candidates per the original roadmap: tune the engine's scoring weights against more real history now that it's running daily; revisit the recommend-only vs. app-becomes-the-logger decision (see "Open decisions" above); or a custom domain for the web dashboard (currently blocked only on DNS access).
