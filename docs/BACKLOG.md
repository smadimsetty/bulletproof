# Outstanding Work — Bulletproof App

Living backlog of known bugs and features, in priority order. Check items off as they're fixed/shipped; add new ones as they come up. For what's already been built and verified, see `docs/superpowers/reports/autonomous-build-log.md`. For one-off implementation plans, see `docs/superpowers/plans/`.

Last reordered: 2026-07-06.

## Roadmap item 1 — Workout Logger fixes (in progress, started 2026-07-07)

Full 6-item roadmap and design context: `docs/superpowers/specs/2026-07-07-logger-fixes-design.md`. Target: items 1-5 done within 3 days of 2026-07-07; item 6 (RAG-based recommendation engine) explicitly allowed to slip.

- [x] Build 18 (the original workout logger overhaul + iOS Live Activity, `afc6be5`) shipped to TestFlight for the first time 2026-07-07.
- [x] **Bug found on-device same day, fixed same day (build 19):** active-session banner rendered under the status bar/notch, couldn't reopen an in-progress "+ New workout" (ad-hoc) session, no direct way to cancel one. Root cause and fix: see `docs/superpowers/reports/autonomous-build-log.md`'s 2026-07-07 entry.
- [ ] **Needs Sohan:** on-device confirmation that build 19's fix actually looks/feels right (banner position, resume, discard, live timer) — not verifiable from a bundle export alone.
- [x] The design spec's "Background" section lists unit (kg/lbs) toggle, demo-video links in the Logger, and per-set mobility logging as gaps — checked the current code 2026-07-07: `afc6be5` already shipped all three (`StrengthSetRow`'s `weightUnit`/`displayUnitToKg`, `demoVideoUrl` rendered in both `StrengthSetRow` and `MobilityChecklistRow`, `MobilityChecklistRow`'s per-`setNumber` add/delete). Spec was written before that commit landed; nothing left to do here.

## Claude engine — now actually running (fixed 2026-07-06)

- [x] **The Claude-driven program builder had never worked since it was built in v2** — every recommendation ever generated was the deterministic fallback template. Two independent causes, both fixed: (1) `ANTHROPIC_API_KEY` was never configured as a GitHub secret until today; (2) `program_builder.py` called the SDK's `messages.parse()` without its required `output_format` argument, so `parsed_output` was unconditionally `None` regardless of whether Claude's response was correct. Fixed by switching to plain `messages.create()` + manual JSON parsing (`_extract_parsed_output`). Also bumped the model to `claude-sonnet-5` (current-gen, same price as the old `claude-sonnet-4-6`) and explicitly disabled thinking (Sonnet 5 runs adaptive-by-default when omitted, which would eat into the response token budget for this JSON-only task). **Live-verified**: a real swap rebuild now shows `program_generated_by: "claude"`, `claude_model: "claude-sonnet-5"`, real token usage, and correctly-written exercise blocks. See `CLAUDE.md`'s 2026-07-06 status entry and `docs/superpowers/reports/autonomous-build-log.md` for the full debugging story.
- [ ] **Next up — smarter program-building**, scoped during brainstorming 2026-07-06 but not yet designed/built (Sohan chose to confirm the plain-Claude baseline first):
  - **Historical data** — all three of: muscle-group/movement-pattern volume balance, exercise-level rotation (e.g. "did dumbbell bench last chest day, suggest incline or barbell this time"), and progressive-overload trends, over a rolling window (2–3 weeks, tunable) that should be easy to adjust while fine-tuning.
  - **Science-based backing** — `evidence_rationale` already exists on all 189 catalog exercises but is never surfaced to Claude (`program_prompt.py`'s `render_catalog_excerpt` doesn't include it). Sohan wants this used **internally only** to bias exercise selection — not shown in the UI.
  - **Favorite influencers** (Jeff Nippard, Jeff Cavaliere, etc.) — document privately which influencer informs which of the system prompt's four synthesized stances (longevity/resilience, hypertrophy, evidence-based programming, PT/rehab), but **never name them in output** — there's an existing, deliberate two-layer guardrail in `program_prompt.py`'s `SYSTEM_PROMPT` against naming any real person, kept intentionally (legal/safety). This is additive documentation, not a reversal of that guardrail.
  - Not yet started: no spec written, no code touched. Pick up by re-reading this list and going straight into design (the requirements above were already gathered, no need to re-ask).

## Priority 1 — Home screen: data source + swap activity

- [x] **Stop sourcing Yesterday-card sleep from Oura's own data; source it from Apple HealthKit instead.** *(Fixed 2026-07-06, corrected same day after on-device testing.)* First pass flipped precedence to HealthKit-first with an Oura fallback. On-device testing then surfaced two more things: (1) per Sohan's direction, Oura is now dropped **entirely** for sleep — `fetchLastNightSleep` in `yesterdaySummary.ts` is HealthKit-only, gated on `healthkit_sync_enabled`; (2) a real off-by-one-night bug — the HealthKit query was being passed *yesterday's* date, which computes the window for the night ending *yesterday* morning (one full night too early). "Last night" viewed today needs *today's* date passed in, since `fetchHealthKitSleepHoursForDate`'s window is "the night ending on the morning of the given date." Verified via direct on-device checks (Apple Health app + iOS Health privacy settings) that this was a genuine code bug, not just an Oura-sync data gap. Workouts/activity needed no change — that pipeline (`activity` table) was already HealthKit-only and still attributes to yesterday's calendar day (unchanged).
- [x] **Make today's recommendation rationale responsive to that data.** *(Fixed 2026-07-06.)* Added a rules-based (no Claude call) second line to the Yesterday card: good sleep (≥7h) + no logged/detected activity → "good day to push hard"; short sleep (<6h) → "consider easing up." Lives entirely client-side in `yesterdaySummary.ts` (`buildYesterdayInsightLine`), not baked into the stored `recommendations.public_rationale`.
- [x] **Bug: swapping today's activity after an activity has already been logged/completed doesn't take effect.** *(Fixed 2026-07-06.)* Root cause: `exercise_logs.recommendation_block_exercise_id` had no `ON DELETE` behavior, so `swap_activity.py`'s delete-old-blocks step threw an unhandled FK violation whenever today's blocks already had logged sets — `recommendations.top_pick` updated but blocks/exercises never got replaced, leaving stale exercises on screen. Fixed via migration `20260706120000_exercise_logs_fk_set_null_on_swap.sql` (`ON DELETE SET NULL`, pushed to production) — logged data (exercise_id, sets, reps, weight) is preserved either way. Also fixed a second, related bug: `run_daily.py`'s `recommendation_already_fresh` guard didn't know about manual swaps, so a later auto-trigger (e.g. pull-to-refresh) could silently overwrite a swap when readiness was still null — now also treats `score_breakdown.manual_swap` as fresh.
- [x] **Swap-activity latency — quick win shipped 2026-07-06.** Added pip dependency caching (`cache: pip`, keyed on `engine/pyproject.toml`) to both `swap-activity.yml` and `daily-cron.yml`. Doesn't touch the bigger latency source (GitHub Actions dispatch + runner boot + Claude call); a full bypass-GitHub-Actions rearchitecture is deferred (see Backlog below) per Sohan's explicit call to keep today's fix scoped.

## Priority 2 — Program page UI

- [ ] Program logic itself works; UI needs multiple changes. Details TBD — to be scoped in a follow-up conversation.

## Priority 3 — Trends tab: past workouts

- [ ] Should be able to see past logged workouts in Trends. Details TBD.

## Explicitly out of scope for now

- Settings screen — deliberately untouched until Priorities 1–3 are ironed out.

## Backlog (not yet prioritized above)

- [ ] Logging feature: "+" button to log new workouts on demand, plus a screen to view past logged workouts. (Was the prior session's top item; now sits behind Priorities 1–3 above.)
- [ ] General aesthetic/visual-polish pass — deferred until function is confirmed solid.
- [ ] Swap-activity full latency fix: bypass GitHub Actions entirely (run the swap logic directly from a Supabase Edge Function calling Supabase + Claude directly) instead of the current mobile → Edge Function → GitHub Actions dispatch → VM boot → checkout → pip install → script chain. Bigger surface area than the 2026-07-06 pip-cache quick win; deferred by Sohan's explicit choice that day.
