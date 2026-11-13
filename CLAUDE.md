# CLAUDE.md — MoveMaxx (formerly Bulletproof)

Project context for MoveMaxx, a mobility-first workout app that started as Sohan's personal dynamic training system. Read this first.

## Name (renamed 2026-11-10)
The app is **MoveMaxx**. It was called "Bulletproof" until 2026-11-10, and older docs, specs and this file's history sections still use that name; treat them as the same project.
- **Renamed:**
  - the app's display name, URL scheme (`movemaxx`), wordmarks and notification titles
  - the website (https://smadimsetty.github.io/movemaxx/; the landing page is at `/` and the old Oura dashboard at `/dashboard`)
  - the GitHub repo (`smadimsetty/movemaxx`; old URLs redirect)
  - package names and Edge Function constants
- **Deliberately NOT renamed:**
  - the bundle ID `com.sohan.bulletproof` and the App Store Connect record (`ascAppId` 6783128365). A new bundle ID = a new App Store app and lost TestFlight history.
  - the Sign in with Apple service ID `com.sohan.bulletproof.signin`
  - the EAS project and Supabase project
  - AsyncStorage keys (`@bulletproof/...`; renaming them resets state on existing installs)
  - the local checkout folder `c:\Dev\Bulletproof`

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

Sohan also asked for two follow-on improvements, both shipped: (1) the "Yesterday" card now shows what **actually happened** the day before — real sleep hours (`recovery`/Oura, falling back to a live single-day HealthKit query when Oura's row is missing that date) plus logged/detected activity (`sessions` first, then the already-synced `activity` table) — instead of re-displaying yesterday's *forecasted* recommendation text, which is what was actually making it look "stuck on rest" (see `apps/mobile/lib/yesterdaySummary.ts`). (2) The swap sheet's options are now ranked within each category by days since that type was last logged (most overdue first, mirroring the engine's own `days_since` signal) instead of a fixed order, so "good activities to switch to" reflects recent real history (see `apps/mobile/lib/swapOptions.ts`'s `daysSinceByType`). 157/157 mobile tests, 115/115 engine tests, clean typecheck. Shipped as TestFlight build 11 (build 10 already had the isProvisional fix; 11 carries the Yesterday redesign + swap ranking).

**Confirmed working end to end on Sohan's real device, same day.** Swap activity actually swaps; the Yesterday card shows real sleep/activity; the recommendations tab no longer nags with "Building today's program..." forever. This is the first feature in the v2/on-demand-trigger line of work verified on-device at the time it shipped, not left as a standing "still needs on-device verification" caveat.

**Still open, deferred, not urgent:** General aesthetic/visual-polish pass explicitly deferred by Sohan until function is right. A "+" button to log new workouts on demand, and a screen to view past logged workouts, were explicitly deferred by Sohan to a later session — nothing started on either yet.

**Outstanding, needs Sohan:** nothing blocking right now. Unrelated to code: Sohan's Oura ring/app hasn't synced in about a week and no session has been logged in the mobile app in about 10 days — both real gaps in his own data-in, not bugs, and exactly the kind of thing the new Yesterday card and swap ranking are designed to surface honestly rather than paper over.

**Next up:** the logging feature (a "+" button to log new workouts on demand, plus a view of past logged workouts), whenever Sohan wants to pick it up.

**Next up:** deploying both Edge Functions (needs Sohan's GitHub PAT) and the on-device walkthrough that verifies the daily trigger, the swap feature, and all the 2026-06-26 fixes actually work as intended on a real phone; the aesthetic/visual-polish pass once function is confirmed solid.

**2026-07-06 — Priority 1 backlog work, plus the Claude engine actually running for the first time ever.** See `docs/BACKLOG.md` for the full list; highlights:
- Yesterday-card sleep now sources from HealthKit only (Oura fully dropped for sleep, per Sohan's explicit direction) and correctly targets *last night* — a real off-by-one-night bug (the original fix queried the wrong date) was caught and fixed the same day via on-device verification.
- Swap-activity's "doesn't take effect after logging" bug fixed: `exercise_logs`' FK to `recommendation_block_exercises` had no `ON DELETE` behavior, so the delete-old-blocks step crashed with an unhandled FK violation whenever today's blocks already had logged sets — `top_pick` updated but blocks never got replaced. Fixed via a production migration (`ON DELETE SET NULL`). A related bug (`run_daily.py`'s freshness guard not recognizing manual swaps, letting a later auto-trigger silently revert one) was also fixed.
- **The Claude-driven program builder has never actually worked, since it was built in v2** — every single recommendation, going back to inception, was the deterministic fallback template, for two independent, stacked reasons: (1) no `ANTHROPIC_API_KEY` was ever configured as a GitHub secret until today; (2) even with a real key, `program_builder.py` was calling the SDK's `messages.parse()` without its required `output_format` argument, so `parsed_output` was *unconditionally* `None` regardless of whether Claude's response was correct (confirmed by reading the SDK's own source — `parse_text()` returns `None` whenever `output_format` isn't given). Root-caused live via temporary debug logging shipped straight to the production GitHub Actions workflow (removed once diagnosed), after two wrong hypotheses (model support, JSON-schema type-array vs `anyOf`) didn't fix it. Fixed by switching to plain `messages.create()` + manual `json.loads()` of the response text. **Live-verified**: a real `pickleball` day rebuilt via swap-activity now shows `program_generated_by: "claude"`, `claude_model: "claude-sonnet-5"`, real token usage, and correctly-written exercise blocks in Supabase.
- Next up on the Claude-engine side (not started): the richer historical-data/science-based/influencer-informed prompt work discussed but deferred until the plain-Claude baseline was confirmed working — see `docs/BACKLOG.md`.

**2026-07-07 — Workout logger overhaul reaches TestFlight for the first time, same-day bug-fix round.** Roadmap item 1 of a new 6-item list Sohan set today (`docs/superpowers/specs/2026-07-07-logger-fixes-design.md` has the full list and design). `afc6be5` (the workout logger overhaul + iOS Live Activity, merged earlier) had never actually been built to TestFlight — shipped as build 18 today, the first real device test of that work.
- **Found on-device within minutes:** starting a workout via "+ New workout" (ad-hoc) left Sohan stuck — the persistent active-session banner rendered under the status bar/notch, tapping it didn't reopen the workout, and the only way to cancel was retrying "+ New workout" and hitting a buried discard option.
- **Root cause:** the banner's routing predates the ad-hoc feature — `docs/superpowers/specs/2026-06-24-logger-design.md` Decision 7 has the banner route to Home because a `sessions` row has no `block_id`. That's still correct for block-based sessions, but ad-hoc sessions got their own dedicated resume route (`/logger/adhoc/[sessionId]`) when they shipped, and the banner was never updated to use it — worse, `ad_hoc_exercise_ids` defaulted `not null '{}'` for every session, so the code had no reliable way to even tell an ad-hoc session apart from a block one.
- **Fixed:** migration `20260707110000_adhoc_exercise_ids_nullable.sql` (pushed, confirmed applied) makes that column nullable with no default, so it's NULL for block-based sessions and an explicit `[]` for ad-hoc ones — a real `isAdhoc` discriminator. Banner now routes correctly via a new `resumeRouteForSession` helper, gained a safe-area top inset, a direct discard (×) button, and a live-ticking elapsed timer. 186/186 mobile tests, clean typecheck, clean `expo export`. Shipped as build 19.
- **Still needs Sohan:** on-device confirmation the fix actually looks/feels right — not verifiable from a bundle export.
- Settings screen explicitly deferred again ("that's fine for now").

**2026-09-17 — mobility sprint pivot (Home tab).** The Home tab stopped doing Oura-driven daily lift/pickleball/run recommendations. Instead: pick one of 4 pain points (Ankles, Rounded Shoulders, Nerd Neck, Anterior Pelvic Tilt) → baseline assessment → 14-day sprint of short daily routines (least-recently-used exercise picker over a seeded pool) → reassessment → before/after summary. The old Logger was deleted. `engine/` and its cron were left running but dormant. Spec: `docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md`. Migrations pushed 2026-09-18.

**2026-11-07 — Hevy-style mobility logger, sub-project A (logger + history).** The roadmap (`docs/superpowers/specs/2026-11-07-mobility-logger-roadmap.md`) makes Bulletproof a full mobility-first workout logger with a social layer, modeled on Hevy's *feature set* (no copied branding or look), in 4 sub-projects: **A** logger + history (this entry) → B routines + library → C progress + stats → D social (friends-first with opt-in public profiles, photo/video posts, copy a workout, report/block/hide). A's spec is `docs/superpowers/specs/2026-11-07-logger-history-design.md`; the plan is `docs/superpowers/plans/2026-11-07-logger-history.md`.
- **Schema:** new `workouts` / `workout_exercises` / `workout_sets`, owner-scoped RLS. `workouts.visibility` exists already (default `private`) but is only enforced in D. The old `sessions`/`exercise_logs` are untouched (still engine-coupled).
- **App:** the tabs are now Workout · History · Trends · Settings.
  - **Workout tab:** start an empty workout, a sprint card, and recent workouts. The sprint flow moved to `/sprint`.
  - **Logger** (`/workout/[id]`): input fields are decided by exercise type (weight×reps / reps / hold / duration). One-sided exercises log Left first. There are hold, switch-sides and rest timers, values from the previous workout prefill each set with a "prev" hint, optional ROM measurements, saving as you go, and the revived lock-screen Live Activity.
  - **History tab and detail** (`/workout-summary/[id]`).
  - **Sprint days are now completed by saving that day's workout** (the tap-a-checkbox flow is gone).
- **Supabase project had auto-paused** (free-tier inactivity; status INACTIVE). It was restored via the management API on 2026-11-07. If the app ever can't connect after a quiet stretch, check this first.
- **A live two-user RLS smoke test caught a real hole** before ship: foreign-key checks bypass RLS, so one user could attach rows to another user's workout or claim their sprint day. Fixed by `20261107130000_workouts_parent_ownership_checks.sql`; re-verified at 18/18 checks passing. Any future table that references a parent row needs the same parent-ownership `WITH CHECK`.
- **Verified:** 207/207 jest, clean tsc, clean `expo export`, both migrations live. A final Opus whole-branch review (6 important findings, all fixed: timer races, edits lost on Finish, keyboard covering rows, abandoned-sprint finish) plus a scoped re-review.
- **Still needs Sohan:** an on-device walkthrough on the TestFlight build. Timers, haptics, keyboard and the Live Activity can't be verified off-device.
- **TestFlight build 21 submitted 2026-11-07** (EAS build `bff0dad8-71cb-420b-9a96-29b66e58edc4`) after Sohan renewed an expired Apple agreement (Apple took ~5 min to register it; a missing/expired agreement blocks `eas submit` with that exact message).
- **Pick-up doc:** `docs/superpowers/reports/2026-11-07-session-handoff.md` (decisions, rulings, parked items, on-device checklist, next steps). RLS smoke test: `supabase/tests/rls_smoke_workouts.py`.
- **Next up:** sub-project B (routines + library).

**2026-11-08/09 — "Finish the app" for a public App Store release (stages 0–4 shipped; v1.1.0 EAS build a69795f0 submitted to TestFlight 2026-11-09).** Spec `docs/superpowers/specs/2026-11-08-finish-the-app-design.md`, visual spec `2026-11-08-visual-design.md`, plans `docs/superpowers/plans/2026-11-08-stage{0..4}-*.md`, pick-up doc `docs/superpowers/reports/2026-11-09-finish-the-app-handoff.md` (on-device checklist, moderation runbook, everything that still needs Sohan).
- **Stage 0:** every `exercises` embed is FK-hinted (Sohan's PGRST201 came from build 20 predating the hint); eye-icon descriptions; assessments prefill from the last one; "Last assessment" peek; parked logger fixes.
- **Stage 1:** Progress tab (streak + calendar, assessment trends, PRs, monthly recap + share card) replaces Trends; PR toasts; `user_settings` table (lazily created, defaults when absent).
- **Stage 2:** routines + folders, mobility-only library, private custom exercises (`exercises.owner_id`; anon can only read global rows now).
- **Stage 3:** email-code + Apple sign-in, onboarding, profiles/follows/feed/likes/comments/photo posts/copy workout/inbox/push, report/block/hide + auto-hide at 3 reporters, rebuilt Settings, account deletion (Edge Function `delete-account`, live-verified), Apple Health write, legal pages in `apps/web`. Visibility is enforced by `security definer` helpers in SQL; `profiles.bio` is not client-selectable (use `rpc('profile_bio')`); photos are read only via signed URLs. Own-data queries filter `owner_id` explicitly because social policies widen reads.
- **Stage 4:** dark theme (volt lime `#C6F432`), `components/ui/` primitives, every screen restyled, logger is a `fullScreenModal` with minimise, new icon/splash, iPhone-only.
- **Live test suites (run with `.env` loaded):** `supabase/tests/rls_smoke_workouts.py` (47), `rls_smoke_social.py` (73), `embed_smoke.py` (11). Re-run after any migration.
- **Blocking a public launch (Sohan):** custom SMTP + `{{ .Token }}` email templates (email sign-in doesn't work until then), Sign in with Apple key secrets for token revocation, Supabase Pro, deploy `apps/web` + set `WEB_BASE_URL`, App Store listing, set own `is_moderator` after onboarding.

**2026-11-09/10 — logger polish, exercise content, equipment tiers, 3 new sprints (v1.2.0, build 23).** Spec `docs/superpowers/specs/2026-11-09-logger-polish-and-sprints-design.md`, plan `docs/superpowers/plans/2026-11-09-logger-polish-and-sprints.md`, pick-up doc `docs/superpowers/reports/2026-11-10-morning-handoff.md` (on-device checklist + calls made).
- **Logger:** optimistic ✓/swipe-delete (they used to await 2 round trips + full reload); stale reloads dropped via a sequence counter; toasts instead of system alerts. Timer-end beep (`lib/timerAlerts.ts`, expo-audio, plays on silent, ducks music) + local notification when locked (`data.kind='timer_end'`, banner suppressed in foreground by `lib/social/push.ts`).
- **Live Activity black box root cause:** the `'widget'` function referenced module-level constants; expo-widgets stringifies that function and runs it in a bare JSC context, so any outer identifier throws and renders nothing. **Everything inside a `'widget'` function must be self-contained.** Now shows elapsed timer (`Text` date timer), current exercise, bounded hold/rest countdown (`timerInterval` + `countsDown`); ended on Finish/Discard.
- **Exercise content:** `exercises.cue` (eye icon one-liner, human voice), `description` = how-to, `evidence_rationale` = why; detail screen embeds YouTube via react-native-webview (iframe wrapper, baseUrl youtube.com — Error 153 fix unconfirmed on-device). Content sources + generators in `docs/superpowers/content/2026-11-09/`. Body-part keys normalized; labels via `lib/bodyParts.ts`.
- **Equipment tiers:** `user_settings.equipment_tier` (null = not asked → treated as advanced); mapping in `lib/equipmentTiers.ts`; `filterCandidatesByTier` in `lib/sprintExercisePicker.ts`. Every slot of every sprint has a bodyweight candidate (`check_basic_coverage.sql` = 0 rows, live).
- **Sprints:** new `full_body`, `total_mobility`, `knees` (4 easy tests each); `pain_points.tagline`; "Change today's focus" (`lib/focusSwap.ts`, `ChangeFocusSheet`) — one-off workouts never complete the sprint day.
- **Verified:** 313/313 jest, clean tsc, expo export; migrations 20261109150000/150500/151000 live; live suites 47/73/11 all pass. **Still needs Sohan:** the on-device checklist in the handoff doc.

**2026-11-10 — renamed to MoveMaxx, plus the logger leftovers (v1.3.0).** See the "Name" section at the top for what was and wasn't renamed.
- **Website:**
  - new dark landing page at `/`; the Oura dashboard moved to `/dashboard`
  - `WEB_BASE_URL` now points at GitHub Pages, so the legal links in the app work. This closes the "deploy apps/web + set WEB_BASE_URL" launch blocker until a custom domain exists.
  - Fixed the support page's raw `/privacy` link, which skipped the basePath and 404'd.
- **Edge Functions:** `trigger-daily-engine` and `trigger-swap-activity` were redeployed with the new repo name. A POST to a renamed repo's API URL does not survive GitHub's redirect.
- **Logger leftovers fixed:**
  - Swipe-delete during a pending ✓ now waits for the ✓ instead of springing back.
  - "Start a new sprint" is atomic: the `switch_sprint` RPC (security invoker; migration `20261110120000`, pushed) replaces the old two-call flow.
  - A tier change re-fits the running sprint (`lib/sprintTierRefit.ts`). It only touches today/later exercises that aren't done, whose day hasn't been started, and that the new tier rules out.
  - `partner_or_bench` now counts as Intermediate.
  - The timer-end beep no longer plays late after a suspension (`isTimerEndFresh`).
- **Verified:**
  - 322/322 jest, clean tsc, expo export
  - live suites: workouts 55/55 (8 new `switch_sprint` checks), social 73/73, embed 11/11
  - the site returns 200 at the new URL
- **TestFlight build 24 (1.3.0) submitted 2026-11-10** (EAS build `630bd44c`).
- **Pick-up doc:** `docs/superpowers/reports/2026-11-10-movemaxx-handoff.md`.


**2026-11-12/13 — adaptive sprint engine (v1.4.0).** Spec `docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md` (§8a.7 records where the code runs), plan `docs/superpowers/plans/2026-11-12-adaptive-sprint-engine.md`, pick-up doc `docs/superpowers/reports/2026-11-12-adaptive-engine-handoff.md`.
- **Days are built lazily, not pre-generated.**
  - `lib/sprintEngine.ts` `ensureDayBuilt` claims `sprint_days.built_at`. It then progresses earlier days, applies the missed-day rule and AI adjustments, and plans the day.
  - The pure rules are in `lib/engine/`: `assessmentPriority`, `progression`, `dayPlanner`, `ladderPick`, `retestRecommendation`, `planSummary`.
  - Activation lays out 14 empty days plus `sprint_slot_state`.
  - A claim older than 60 s with no rows is reclaimed, and a caller that loses the claim waits for the rows.
- **Content:**
  - `slot_ladder`, `sprint_slots`, `assessment_slot_links`, plus `target_value` / `noise_threshold` / `raw_direction` on `assessment_definitions`
  - all 7 pain points, sources in `docs/superpowers/content/2026-11-12-engine/`
  - `supabase/tests/check_ladder_coverage.sql` must return 0 rows
- **Logger and finish sheet:**
  - The weaker side goes first, plus one extra set (`workout_exercises.lead_side`).
  - The finish sheet asks effort (easy/right/hard), pain 0–10 and area. These replace `reaction`; `finishWorkout` returns `{ result, painFlag }`.
- **Swaps:** swaps stay on the level; "Easier version" steps back one step; a tier refit drops to the nearest lower level.
- **Retest:**
  - A change within the noise threshold reads "No clear change".
  - Stay/switch: Stay runs the `continue_sprint` RPC, so there's no new baseline and state carries over.
- **`sprint-coach` Edge Function** is the only Claude call: Haiku 5.5 via `SPRINT_ENGINE_MODEL`, structured JSON validated by `validate.ts`, logged to `engine_calls`, never blocking. **`ANTHROPIC_API_KEY` is not set**, so every call falls back to the rules. Add a per-user rate limit before a public launch.
- **Gotcha:** `supabase functions deploy <fn> --use-api` works without Docker.
- **Verified:**
  - 484/484 jest, clean tsc and `expo export`
  - live: `lib/sprintEngine.live.test.ts` (run with `LIVE_ENGINE=1`, throwaway user) 6/6; workouts 82/82, social 73/73, embed 11/11
  - both coverage checks 0 rows
  - a whole-branch review: 5 important issues found, all fixed
- **TestFlight build 25 (1.4.0) submitted 2026-11-13** (EAS build `3b3c42c8`). `eas submit` must use `--profile preview`: that submit profile holds the `ascAppId` and API key, while `production` is empty and fails with `--non-interactive`.
- **Still needs Sohan:** the on-device checklist in the handoff doc, a decision on the API key, and a review of the content numbers marked DEFAULT.

**2026-11-13 — email sign-in works (closes that launch blocker for the beta).**
- Custom SMTP is Gmail (`smtp.gmail.com:465`), sending from smadimsetty@gmail.com as "MoveMaxx" with a Google app password. The password is `GMAIL_APP_PASSWORD` in the repo-root `.env`, quoted because it contains spaces.
- Both email templates (Magic Link and Confirm signup) show the 6-digit `{{ .Token }}`. The send limit was raised from 2 to 30 emails an hour.
- Set through the Supabase Management API: `PATCH /v1/projects/<ref>/config/auth`.
- Live-verified: a real code was delivered to the Gmail inbox within seconds, and `verify` returned a session. The test user was deleted afterwards.
- Gmail caps sending at roughly 500 emails a day. When there's a domain, move to Resend with `noreply@<domain>`; no app change is needed.

**2026-11-13 — external TestFlight beta set up through the App Store Connect API.**
- **Group:** external group "Beta" (id `944164ba-d432-4a55-9ae7-a81d20f3afc5`), with a **public link https://testflight.apple.com/join/c5VvAccF** capped at 100 testers and feedback on.
- **Build 25** (1.4.0) is in the group and was submitted for Beta App Review (`WAITING_FOR_REVIEW`).
- **Beta info:** the description and "What to test" are filled in. The feedback email is smadimsetty@gmail.com, and the privacy URL is `https://smadimsetty.github.io/movemaxx/privacy` (no trailing slash; with one it 404s).
- **Reviewer details:** Sohan's name, email and phone; no demo account. The notes point reviewers to Sign in with Apple.
- **API:** an ES256 JWT signed with `apps/mobile/secrets/AuthKey_72FC5AHX2C.p8`, issuer `f69c055c-d862-48c8-8fa5-abf6d94743ee`, app id 6783128365. In Git Bash, `export MSYS_NO_PATHCONV=1` first, or `/v1/...` arguments get rewritten into Windows paths.
- **Each new build needs:**
  1. `POST /v1/betaGroups/<id>/relationships/builds`
  2. a `betaBuildLocalizations` "whatsNew" for that build
  3. `POST /v1/betaAppReviewSubmissions`, but only for the first build of a new version

**2026-11-13 — ops: weekly Supabase usage email, and Sohan's sprint moved to the new engine.**
- **Weekly report:** `.github/workflows/usage-report.yml` runs Mondays at 13:00 UTC, or on demand with `gh workflow run usage-report.yml`.
  - `scripts/usage_report/report.py` (stdlib only, pytest beside it) calls the `admin_usage_report()` function. The function is from migration `20261113130000` and only the service role can call it.
  - It emails smadimsetty@gmail.com the database size, file storage and monthly active users against the Free plan limits, flagging "watch" at 50% and "upgrade soon" at 80%, plus the week's activity and the largest tables.
  - It uses the repo secret `GMAIL_APP_PASSWORD`. The first run on 2026-11-13 was delivered. The weekly run also counts as project activity, so the Free project won't auto-pause.
- **Old-engine days:** Sohan's in-flight Ankles sprint (cycle 2, started 2026-11-08) had days 1-6 pre-built by the old picker. That picker computed "least recently used" once for all 14 days, so every day repeated the same exercises.
  - The T1 migration ran when it was already 2026-11-13 in UTC, so it kept day 6 (Nov 13).
  - Day 6 was reset by hand (no workout was attached) so the new engine builds it.
  - Days 7-14 are built lazily. **Builds 24 and earlier show those days as empty**, so use build 25 or later.
- **Moderator:** Sohan's `profiles.is_moderator` was already true.

**2026-11-13 — six quick UI fixes.**
- The first tab is now **Training** (it was Workout), and its "Recent" list is gone. Past workouts live in History and Profile.
- **Exercise names lost their pain-point prefix** ("Ankle: Banded Eversion" is now "Banded Eversion"). Migration `20261113140000` (pushed). The band face pull is renamed "Band Face Pull" so it doesn't clash with the cable "Face Pull". Four older global rows are true duplicates of re-seeded sprint content (Band Pull-Apart, Dead Bug, Couch Stretch, Deep Squat Hold). The library shows one of each via `dedupeGlobalByName`, preferring the sprint-pool row.
- **"Why today" wording:** it used to read "Focus today: <test>, your biggest gap", which sounded like an exercise. It now says "Today targets your weakest test: <test>." The same migration rewrote the days already built.
- **Sprint icons:** `components/SprintIcon.tsx` (line drawings via react-native-svg), shown in the sprint picker and "Change today's focus".
- **Empty-state buttons are centred**, which fixes "Create routine" and "Find people". The shared `Button` defaults to `alignSelf: 'flex-start'`.
- **Verified:** 486/486 jest, clean tsc, expo export; live suites 82/73/11.
- **Next:** see `docs/BACKLOG.md` "Next up" (History+Progress merge, $2/month or $10/year plan, 4 AI calls per user per day cap).

