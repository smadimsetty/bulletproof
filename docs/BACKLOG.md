# Outstanding Work — Bulletproof App

Living backlog of known bugs and features, in priority order. Check items off as they're fixed/shipped; add new ones as they come up. For what's already been built and verified, see `docs/superpowers/reports/autonomous-build-log.md`. For one-off implementation plans, see `docs/superpowers/plans/`.

Last reordered: 2026-07-06.

## Priority 1 — Home screen: data source + swap activity

- [x] **Stop sourcing Yesterday-card sleep from Oura's own data; source it from Apple HealthKit instead.** *(Fixed 2026-07-06.)* `yesterdaySummary.ts`'s `fetchYesterdaySleep` now checks HealthKit first (gated on the `healthkit_sync_enabled` Settings toggle) and falls back to `recovery.sleep_hrs` (Oura) only if HealthKit has nothing — flipped from the old Oura-first/HealthKit-fallback order. Root cause: the engine's Oura pull happens once at a fixed time and never retries, so `recovery.sleep_hrs` could stay null for a date even after Oura synced later; HealthKit is queried live on every card load instead. Workouts/activity needed no change — that pipeline (`activity` table) was already HealthKit-only.
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
