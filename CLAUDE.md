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

### Data model (v2, as of 2026-06-25 — multi-user-ready, real RLS on every personal table)
- `sessions` — date, type (`upper`/`lower`/`pickleball`/`run`/`rest`/`mobility` — the `_a`/`_b` variants from v1 were dropped; day-to-day variety now comes from the engine picking different exercises within a type, not from rotating variant types), `started_at`/`ended_at`/`felt_rating`, owner_id. A partial unique index enforces at most one open (`ended_at IS NULL`) session per owner at a time.
- `recovery` — date, sleep_hrs, hrv, resting_hr, subjective_readiness (1–10), soreness_flags, owner_id
- `exercises` — name, movement_pattern, exercise_type (strength/mobility_stretch/plyometric/balance/cardio), demo_video_url, is_complex, target_goals[], body_parts[], evidence_rationale, equipment_needed[], default_sets, default_rep_range, unilateral, is_corrective. 189 tagged rows (seeded Phase 1), equipment variants of the same lift kept as separate rows. Global/shared, read-only to authenticated users.
- `user_profile` — profile + `pains` (jsonb array of `{body_part, severity, note, since}` — renamed from v1's flat `injury_constraints`), `activities` (jsonb), `preferred_split` (FK to `split_taxonomy`), `current_goals` (jsonb, app-capped at 3), `training_frequency_mode`, `diet_preference`, `weight_kg`, `birth_date`, `location`, `healthkit_sync_enabled`, owner_id
- `recommendations` — top_pick/runner_up/rationale as in v1, plus `program_generated_by` ('claude'/'fallback_template'), `claude_model`, `claude_usage` (service-role-only); owner_id. Child tables `recommendation_blocks` (one row per program block: type, order, title, estimated_minutes) and `recommendation_block_exercises` (one row per exercise within a block: prescribed sets/reps/weight-note, swap audit trail via `swapped_from_exercise_id`)
- `exercise_logs` — one row per logged set (strength) or per checkbox item (mobility); the engine's primary recent-history signal now, more granular than `sessions` alone
- `daily_feedback` — free-text per-day feedback from the Home screen, read by the program-builder
- `split_taxonomy` / `activity_taxonomy` / `goal_taxonomy` / `body_part_taxonomy` — new lookup tables backing Settings' dropdown-to-add UI; global/shared, seeded once
- `recommendations_public` — the same 5-column view (`date, top_pick, runner_up, public_rationale, generated_at`) the public web dashboard and phone app both read; contract unchanged across the whole v2 migration

Multi-user RLS: every personal table has `owner_id uuid references auth.users not null default auth.uid()` with real `owner_id = auth.uid()` policies — verified against a second real auth user during the schema v2 migration, not just asserted.

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

### Supabase migrations are never auto-applied — this caused a real bug
There is no CI step that pushes `supabase/migrations/*.sql` to the live database. Every migration has to be manually pushed, or it just sits in the repo as a file that looks applied but isn't. **This actually happened**: `20260624050000_logger_rls_fixes.sql` (adds the `authenticated_read_exercises` RLS policy) sat unapplied on production from 2026-06-24 until 2026-06-26, causing every exercise name in the mobile app's Home/Logger screens to silently render as "Unknown exercise" (the nested `exercises` join was being filtered to zero rows by RLS for every signed-in/`authenticated` request, since the table only had an `anon`-scoped read policy until that migration landed).

**The Supabase CLI needs no separate install** — `npx supabase <command>` runs it directly (confirmed working, no `npm install -g` needed, despite Supabase's own docs suggesting Scoop/Homebrew/binary installs). A `SUPABASE_ACCESS_TOKEN` and the project ref (from `SUPABASE_URL`'s subdomain) already live in the repo-root `.env`.

**Safe workflow after writing any new migration:**
```
export SUPABASE_ACCESS_TOKEN=<token from .env>
npx supabase link --project-ref <ref from SUPABASE_URL>     # one-time per machine
npx supabase migration list --linked                         # READ-ONLY -- compare local vs remote first
npx supabase db push --linked                                 # only after confirming what's actually pending
```
Always run `migration list` before `db push` — don't assume the remote is caught up just because the repo has the file.

## Open decisions — resolved during the v2 rebuild (2026-06-25)
1. **Logging model: app-becomes-the-logger**, not recommend-only. The mobile app's Logger screen (v2 Phase 6) owns real-time per-set logging (reps/weight/completion) against `exercise_logs`, which is now the engine's primary recent-history signal — no Strong/Hevy dependency.
2. **Storage/runtime: Supabase + RLS**, done once, no throwaway. Now genuinely multi-user-ready (every personal table owner-scoped, verified against a second real auth user), not just structured for it.
3. **Rotation granularity: no `upper_a`/`upper_b`/`lower_a`/`lower_b` variants.** The schema v2 migration simplified `session_type` to plain `upper`/`lower`; day-to-day variety comes from the engine's Claude-driven exercise selection picking different exercises within the same session type, not from rotating between pre-baked variant types.

No open decisions remain from the original list. See `docs/superpowers/reports/autonomous-build-log.md`'s "2026-06-25 -- v2 run complete" entry for what's still outstanding (credentials/on-device verification, not design decisions).

## Principles / guardrails
- **Friction-first:** if daily data-in takes >~20s, it dies. Optimize data-in before intelligence. (Oura largely solves recovery.)
- Data model permanent; engine + UI disposable/rebuildable.
- **Rules-based engine first** — transparent, debuggable, free, tunable (Sohan is a data analyst). ML only after months of logged data.
- The **readiness gate doubles as the injury guardrail** (neck/ankle history) — when readiness tanks, it forces rest/mobility.
- Multi-user schema/RLS is now real (done in the v2 rebuild, not just designed-for) — every personal table is owner-scoped and verified against a second real auth user. What's still a later addition: actual multi-user *features* (invites, sharing, anything beyond "a second Apple ID could sign in and get their own isolated data"). Health data — even a friend's sleep/HRV — stays sensitive; RLS already covers it from the data layer up.
- **"High-impact only":** cap junk volume; compound-based; science-backed exercise selection.

## To verify at build time (do NOT assert as current fact)
- **Strong/Hevy write API:** last known = Strong has no public write API (CSV export only). Verify when reaching the logging/integration phase.
- ~~**Oura API specifics** (endpoints, auth, token scopes) — confirm at build time.~~ **Confirmed in Phase 2** (see `docs/superpowers/plans/2026-06-21-phase2-weight-tuning.md` Global Constraints): base URL `https://api.ouraring.com/v2/usercollection`, Bearer-token PAT auth (not OAuth2), `start_date`/`end_date` query params, `next_token` pagination. Readiness score is **0-100** (not the 1-10 this doc originally assumed for `subjective_readiness`) — rescaled via `max(1, min(10, round(score / 10)))` when written to the existing column rather than changing the schema. Oura genuinely auto-detects `pickleball` and `running` as named workout activities, though pickleball detection looks under-frequent relative to actual play frequency (26 instances over ~22 months of real data) — worth a second look once more data accumulates.

## Status
**v1** (6 phases, complete 2026-06-23) shipped a rules-only engine, a single-screen phone app, and a public web dashboard — see the build log's "2026-06-23 -- Run complete" entry.

**v2** (9 more phases, complete 2026-06-25) rebuilt the schema for real multi-user readiness, gave the engine Claude-driven exercise selection on top of the deterministic safety rules, and rebuilt the phone app from one screen into four (Home, Settings, Logger, Trends) — see `docs/superpowers/reports/autonomous-build-log.md`'s "2026-06-25 -- v2 run complete" entry for the full before/after and the consolidated outstanding-items list. In short, end to end right now: every morning at 11:00 UTC a GitHub Actions cron job pulls real Oura readiness, asks Claude to build a full multi-block exercise program (or falls back to a safe deterministic picker if Claude/its API key isn't available), and writes it to Supabase. The iPhone app signs in with Apple, syncs Apple Watch workouts plus sleep/heart-rate from HealthKit, and across its four tabs shows today's full program with real per-set logging, an editable profile/settings screen, and time-range training analytics. The public web dashboard still shows the original two outputs (today's + yesterday's recommendation) to anyone with the link, no login required, and was re-verified against the new schema. Both clients read only public-safe Postgres views/owner-scoped RLS — raw biometrics never leave the private layer.

**2026-06-26 — first real on-device walkthrough, on Sohan's iPhone via a TestFlight build.** This surfaced real bugs invisible to test/tsc/build-level verification (see `docs/superpowers/reports/autonomous-build-log.md`'s "2026-06-26" entry for full detail):
- **Fixed:** `recommendations.public_rationale` baked in "Today's..." day-relative wording at write time (both the Claude path and the fallback-template path), so the same persisted string read as obviously wrong once shown under "Yesterday" the next day. Reworded to date-neutral phrasing in `engine/rationale.py`/`program_builder.py`. Forward-looking only — already-written rows keep the old wording until the next cron run.
- **Fixed:** every exercise name rendered as "Unknown exercise" — root cause was the unapplied migration described above, not a code bug. Pushed to production 2026-06-26.
**2026-06-26 — same-day Logger + Settings bug-fix pass, all fixed end to end** (see the build log's "Logger and Settings bug-fix pass" entry for full root-cause detail on each): Logger's "logs don't save" was a direct consequence of the "Unknown exercise" root cause above (an empty-string exercise id falling through to a not-null FK column, failing silently); fixed with an early guard plus visible error feedback. Swipe-to-delete added for individual logged sets (built on React Native core's `Animated`/`PanResponder`, not a new native dependency). HealthKit sync toggle previously had zero effect on anything — `_layout.tsx` never read `healthkit_sync_enabled` at all — now gated correctly. Goals/Pains' two-disjoint-cards layout bug fixed (`DropdownAddSection` no longer self-wraps in a card). A failed Settings save no longer blanks the entire screen. Every explicit-Save section now shows a real Saved/error confirmation. Pains' note field no longer saves on every keystroke. Verified: 122/122 jest, clean tsc, clean bundle export — **still unverified on a real device**, same recurring caveat as everything else in this build.

**2026-06-26 — on-demand recommendation trigger.** Today's program no longer has to wait for the fixed 11:00 UTC cron. `engine/run_daily.py` gained a guard that skips the whole Oura/scoring/Claude pipeline if today's row is already built from real readiness — a cheap no-op, not a duplicate paid Claude call. The mobile Home screen now detects a missing/provisional program on open or foreground, fires a new Supabase Edge Function (`trigger-daily-engine`) that dispatches the existing `daily-cron.yml` workflow on demand via GitHub's API, and polls for up to 90s until the real program lands, with a working pull-to-refresh fallback. The cron stays as the backstop for days the app isn't opened early. Mobile-app-only by design — the public web dashboard still only reads passively, so it can't trigger a GitHub Actions run or spend Anthropic API budget. See the build log's "2026-06-26 -- On-demand recommendation trigger" entry for the two bugs (screen-blanking refresh, error-stranding on a transient poll failure) caught and fixed during review before merge.

**2026-07-05 — Home screen bug hunt + swap-activity feature.** Root-caused (using live, read-only checks against production, not just code reading) why the Home screen "wasn't working": `isProvisional` (`score_breakdown.readiness == null`) was being treated by the Home screen as "not ready yet, keep polling," but readiness can be permanently null for a given day (Oura's ring/app often syncs later than the 11:00 UTC cron's one shot at pulling it, and no Anthropic key is configured, so every recommendation so far has been the fallback-template path with null readiness) — this made the app re-trigger the on-demand engine call and re-enter a 90s "Building today's program..." poll on every single foreground, forever, even with a perfectly valid recommendation already on screen. Fixed by bounding that auto-retry to once per local calendar day (reset by pull-to-refresh), via a new pure, unit-tested `shouldAttemptFreshRecommendation` helper. Separately investigated "yesterday's summary" and found no code bug — it renders correctly from the same row fetch; it just looked stuck because no session has been logged in ~10 days and Oura hasn't synced in about a week, so the deterministic engine has correctly kept recommending rest/mobility given that real input gap. The swap-activity feature is now fully built end to end: `engine/swap_activity.py` forces today's recommendation to any of the six real session types by reusing `program_builder`/`run_daily`'s existing logic untouched, backed by a new `swap-activity.yml` workflow + `trigger-swap-activity` Edge Function mirroring the existing on-demand-trigger architecture exactly, with the mobile swap sheet now offering only the six types the engine can actually build a program for (previously it surfaced taxonomy entries like "tennis"/"yoga" the backend had no support for at all). 115/115 engine tests, 135/135 mobile tests, clean typecheck. See the build log's "2026-07-05" entry for full detail.

**2026-07-05 (later same day) — deploy gap fixed, Yesterday card redesigned, swap suggestions ranked.** Sohan tested the swap feature right after the Edge Functions were deployed and it still failed ("couldn't start the swap"). Root cause, found via a live `gh run list --workflow=swap-activity.yml` 404: **the day's whole commit (14 commits, going back through the 2026-06-26 on-demand-trigger work) had only ever been committed locally, never `git push`ed** — Edge Functions deploy straight from the local filesystem (so deploying worked fine), but GitHub Actions `workflow_dispatch` needs the `.yml` file to exist on the remote default branch, and `swap-activity.yml` never did. This is the same *class* of bug as the "Supabase migrations are never auto-applied" lesson above — locally-complete work that silently isn't live — worth remembering: **finishing work in this repo isn't done until it's pushed, not just committed.** Fixed with a plain fast-forward `git push`; live-verified end to end afterward (a real `gh workflow run swap-activity.yml` dispatch actually swapped the row and wrote `manual_swap: true` to `score_breakdown`).

Sohan also asked for two follow-on improvements, both shipped: (1) the "Yesterday" card now shows what **actually happened** the day before — real sleep hours (`recovery`/Oura, falling back to a live single-day HealthKit query when Oura's row is missing that date) plus logged/detected activity (`sessions` first, then the already-synced `activity` table) — instead of re-displaying yesterday's *forecasted* recommendation text, which is what was actually making it look "stuck on rest" (see `apps/mobile/lib/yesterdaySummary.ts`). (2) The swap sheet's options are now ranked within each category by days since that type was last logged (most overdue first, mirroring the engine's own `days_since` signal) instead of a fixed order, so "good activities to switch to" reflects recent real history (see `apps/mobile/lib/swapOptions.ts`'s `daysSinceByType`). 157/157 mobile tests, 115/115 engine tests, clean typecheck. A new TestFlight build was shipped with all of today's changes (build 10 already had the isProvisional fix; a follow-up build carries the Yesterday redesign + swap ranking).

**Still open, deferred, not urgent:** General aesthetic/visual-polish pass explicitly deferred by Sohan until function is right. The "+" log-new-workout button and a workout-history view, which Sohan asked about in the same conversation as the fixes above, were explicitly deferred by him to a later step.

**Outstanding, needs Sohan:** the on-device walkthrough confirming the new TestFlight build actually behaves as intended (swap sheet ranking, Yesterday card showing real sleep/activity, the on-demand trigger no longer nagging forever) — nothing else known to be blocking; both Edge Functions are deployed and live-verified as of this entry. Also unrelated to code: Sohan's Oura ring/app hasn't synced in about a week and no session has been logged in the mobile app in about 10 days — both real gaps in his own data-in, not bugs, and exactly the kind of thing the new Yesterday card and swap ranking are designed to surface honestly rather than paper over.

**Next up:** deploying both Edge Functions (needs Sohan's GitHub PAT) and the on-device walkthrough that verifies the daily trigger, the swap feature, and all the 2026-06-26 fixes actually work as intended on a real phone; the aesthetic/visual-polish pass once function is confirmed solid.
