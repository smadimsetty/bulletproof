# Trends screen (Phase 7) — design decisions

Implements the "Phase 7 — Trends" section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`. This note
captures only the implementation-level decisions that section leaves open
— not a full restatement of the design.

Written directly by the orchestrating session rather than a dispatched
Planner subagent (per the token-optimization note added to
`docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md`
during Phase 6) — implementing it directly too, so a separate
verbatim-code implementation plan would just double the writing cost.
This doc plus the task list tracked in the orchestrator's todo list stands
in for that plan.

## Decisions

1. **Charting library: `react-native-gifted-charts`**, not `victory-native`.
   Checked both against npm: `victory-native` v41 requires
   `@shopify/react-native-skia`, `react-native-reanimated`, and
   `react-native-gesture-handler` — three more native modules on top of an
   already-native-heavy app (HealthKit, Apple Sign-In, haptics).
   `react-native-gifted-charts` only needs `react-native-svg` (already a
   transitive dependency of this Expo SDK) and `expo-linear-gradient`. For
   one line chart and one bar chart, the lighter dependency footprint wins
   — consistent with CLAUDE.md's "no speculative complexity" framing.
   Installed via `npx expo install` so versions are pinned to what Expo
   SDK 56 actually bundles, not `npm install`'s "latest."

2. **AI summary: deterministic, not a live Haiku call.** The design
   spec's Claude-integration table calls for a Haiku-generated summary
   computed on open/timeframe-change. A *secure* version of that requires
   a server-side call (a Supabase Edge Function holding the Anthropic key)
   — calling Claude directly from the phone would mean embedding a real
   API credential in the compiled app, exactly the risk Phase 5's
   Home-screen summary deliberately avoided (see
   `docs/superpowers/reports/autonomous-build-log.md`'s 2026-06-24 Phase 5
   entry). No such Edge Function exists yet, and Phase 2 already flagged
   that no Anthropic key is configured at all yet (GitHub secret, for the
   daily cron). Building Edge Function infrastructure is out of scope for
   a screen-rendering phase. Instead, `lib/trendsSummary.ts` computes a
   real, data-driven plain-language sentence client-side from the same
   aggregates the charts render (average sleep, session count by type,
   volume trend) — not a stub, an actually useful summary, just not
   LLM-generated. The function signature takes the aggregated data only
   (no raw biometric leakage concern, since it's already the signed-in
   owner's own data) so swapping in a real Edge-Function-backed Haiku call
   later only touches this one function. Flagged as a gap in the phase
   report, same framing as Phase 2's missing-key gap.

3. **Time ranges**: `week` (7 days), `month` (30 days, default per spec),
   `6mo` (182 days), `year` (365 days) — each computed as `[today - N
   days, today]` inclusive. No calendar-month/ISO-week alignment; a
   rolling window is simpler and matches "past month" framing in the spec
   text.

4. **Muscle-group volume**: weekly buckets within the selected range
   (Monday-aligned ISO weeks), volume per bucket per body part = sum of
   `reps_completed * weight_kg` across completed `exercise_logs` rows
   whose `exercises.body_parts` includes that muscle group (an exercise
   can count toward more than one body part — e.g. a row tagged
   `['shoulders', 'triceps']` contributes its full volume to both bars,
   matching "grouped by muscle group" rather than forcing one-exercise-one-
   group). Bodyweight sets (`weight_kg` null) contribute `reps_completed`
   alone (volume tracking is inherently approximate for bodyweight work —
   documented, not hidden).

5. **Best-lift ranking** (the bar drill-down): within the tapped muscle
   group and current range, rank `exercise_logs` rows by estimated 1RM —
   Epley's formula (`weight_kg * (1 + reps_completed / 30)`) when the
   exercise's `is_complex` flag is true and both `weight_kg`/
   `reps_completed` are present, otherwise raw `weight_kg` (isolation
   lifts, or rows missing reps). Show top 5, "show more" loads 5 more from
   the same sorted list (no live re-query — the full set for one muscle
   group/range is never large enough to warrant server-side pagination at
   this user count).

6. **No isolated render tests for screen-level components** — same
   precedent as every prior phase (no RN render harness in this repo).
   Pure aggregation/range functions get real unit tests; chart/screen
   components get `tsc` + the Task-14-equivalent manual/bundle pass.
