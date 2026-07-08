# Workout Logger fixes — design spec

Item 1 of a 6-item roadmap Sohan set on 2026-07-07 (target: items 1–5 done
within 3 days; item 6, a RAG-based recommendation engine, is explicitly
allowed to slip past that window). The full roadmap, for context:

1. **Workout Logger fixes** (this spec)
2. Sync recommendation labels with the user's preferred split (e.g. a
   push/pull/legs user should see "push"/"pull"/"legs", not "upper"/"lower")
3. Trends tab: show past logged workouts
4. Goals page restructure: combine preferred split with training frequency;
   group pains together (currently rendered as separate disjoint pieces)
5. User onboarding flow (new user selects pains, goals, split, etc.)
6. RAG-based recommendation engine + token-usage optimization (deferred,
   can slip past the 3-day window)

Items 2–6 each get their own spec/plan cycle later. This document covers
item 1 only.

## Background — what's actually there today

Read directly from the code before designing (not assumed):

- **Logger already has a Start/End Workout flow.** `apps/mobile/app/logger/[blockId].tsx`
  shows a "Start Workout" button when there's no active session and an
  "End Workout" button when there is one (`handleStartWorkout`/`handleEndWorkout`,
  writing `sessions.started_at`/`ended_at` via `lib/sessionLifecycle.ts`).
  Ending shows a completion celebration modal with elapsed minutes. This
  flow already works; it's just only reachable *inside* Logger, one tap
  deeper than Home.
- **A "+" already exists, but it's not what's being asked for.** The
  "+ Add an exercise" button inside `[blockId].tsx` (`handlePickExercise`)
  adds one extra exercise to today's existing block via `ExercisePickerSheet`.
  It does not start a new, freeform workout unrelated to today's
  recommendation — that's a separate, previously-deferred backlog item
  now being pulled into this spec.
- **`exercise_logs` already has an ad-hoc key.** Per its own code comments
  (`lib/exerciseLogs.ts`), rows are keyed either by
  `(recommendation_block_exercise_id, set_number)` for prescribed exercises,
  or by `(exercise_id, date, set_number)` for ad-hoc ones — the ad-hoc path
  already exists and is exercised today by the in-block "+ Add exercise"
  flow. This spec's new ad-hoc-workout entry point reuses that same key,
  it doesn't invent a new one.
- **Strength vs. mobility set logging is currently asymmetric.**
  `StrengthSetRow.tsx` renders one row per set (reps/weight inputs +
  completed checkbox), with "+ add set" and swipe-to-delete already built.
  `MobilityChecklistRow.tsx` renders a *single* checkbox for the whole
  exercise — `set_number` stays `null` — with the prescription ("3 x 10")
  shown only as a static label. Mobility exercises currently log "did you
  do it," not actual sets performed.
- **No unit preference exists anywhere.** `exercise_logs.weight_kg` is a
  hardcoded-kg numeric column; `StrengthSetRow.tsx` hardcodes the input
  placeholder as `"kg"`. `user_profile.weight_kg` is the user's body weight
  (shown in Settings as "Weight (kg)"), not a unit preference. No kg/lbs
  toggle exists.
- **`demo_video_url` is fetched but never rendered in Logger.** It's
  threaded through `LoggerExercise` data (`lib/loggerBlock.ts`) and carried
  along through swap/add-exercise flows, but only actually rendered as a
  "Watch demo" link on the Home screen (`app/(tabs)/index.tsx`), never in
  `StrengthSetRow.tsx` or `MobilityChecklistRow.tsx`.
- **The active-session banner already exists and is DB-backed.**
  `app/_layout.tsx` fetches the active session (`fetchActiveSession`) on
  sign-in and on every `AppState` foreground transition, storing it in
  local `useState` and rendering `ActiveSessionBanner` app-wide. There is
  no AsyncStorage/Zustand cache of session state — it's a live re-query
  every time. In theory this means "closed and reopened the app, banner
  should reappear" already works; Sohan's report that it doesn't is being
  treated as a real bug to root-cause during implementation, not a
  from-scratch feature.
- **The app is pure Expo managed workflow.** No `ios/` native project
  exists (`apps/mobile/app.json` only, no `app.config.js`, no `ios/` dir).
  `expo-dev-client` is listed as a package dependency and `eas.json` already
  defines a `development` build profile (`developmentClient: true`,
  `distribution: internal`), but neither has ever actually been used to
  produce an installed build on a device — this project's builds have only
  ever gone through the standard `eas build`/`eas submit` → TestFlight path.
  No `ios.deploymentTarget` is set, so it inherits the Expo SDK 56 default,
  which is below the 16.2 minimum Live Activities require.

## A — Ad-hoc "+" workout button & per-recommendation Start button

**Start button on Home.** Each block row in "Today's Program" gets an
explicit "Start" button/affordance, calling the same `handleStartWorkout`
logic (write `sessions.started_at`, respecting the existing
`sessions_one_active_per_owner` partial unique index) and then navigating
into `/logger/[blockId]` already started — collapsing "open Logger, then
tap Start" into one tap. Tapping the row body (not the Start button) still
opens Logger without auto-starting, for reviewing/logging against an
already-started or already-ended session.

**Ad-hoc "+" entry point.** New affordance on Home (e.g. a floating "+" or
header icon) opens a flow to log a workout that is not tied to today's
recommendation at all:
1. User picks a session type (upper/lower/pickleball/run/mobility — rest
   excluded, nothing to log against rest).
2. User picks exercises via the existing `ExercisePickerSheet`.
3. A new `sessions` row is created directly (`type` = chosen type,
   `started_at` = now), subject to the same one-active-session constraint
   as any other start.
4. A new Logger route variant (e.g. `/logger/adhoc/[sessionId]`) renders
   the picked exercises and logs against `exercise_logs` using the
   existing ad-hoc key — `(exercise_id, date, set_number)`, no
   `recommendation_block_exercise_id`. No schema changes, no fake
   `recommendations`/`recommendation_blocks` rows invented.
5. Ending the ad-hoc workout uses the same `handleEndWorkout` path as any
   other session.

This was chosen over the alternative (make `recommendation_blocks.recommendation_id`
nullable and manufacture a throwaway recommendation+block so the existing
`/logger/[blockId]` screen needs zero changes) because it avoids polluting
`recommendations` history with fake rows that would muddy any future
analytics or the trends work in item 3.

## B — Units toggle (kg/lbs)

- New column: `user_profile.weight_unit text not null default 'lbs' check (weight_unit in ('kg','lbs'))`.
- Settings gets a toggle/segmented control for it.
- `StrengthSetRow.tsx` reads the profile's `weight_unit` (via whatever
  hook/context already exposes the profile — same one Settings itself
  reads from) and displays/accepts input in that unit. `exercise_logs.weight_kg`
  remains the canonical stored unit — conversion happens only at the
  display/input boundary (convert lbs input → kg on save; convert stored
  kg → the chosen unit on read). No backfill needed since all existing
  logged data is already in kg.
- The toggle also governs Settings' existing body-weight field (currently
  labeled "Weight (kg)", stored in `user_profile.weight_kg`) — same
  convert-at-the-boundary treatment, one consistent preference across the
  app rather than two independent unit settings.

## C — Mobility per-set logging

- `MobilityChecklistRow.tsx` is rebuilt to match `StrengthSetRow.tsx`'s
  shape: instead of one checkbox for the whole exercise, render N per-set
  checkbox rows (N from `prescribedSets`, same source the static "3 x 10"
  label already reads from today), with "+ add set" and swipe-to-delete
  mirroring the strength row exactly. No reps/weight text inputs — mobility
  sets only ever track "done" per set, matching what the exercise type
  actually needs.
- `exercise_logs` writes one row per set (`set_number` 1..N, `completed`
  true/false, `reps_completed`/`weight_kg` left null) instead of today's
  single row with `set_number = null`. This is the existing per-set-row
  shape the table already supports for strength exercises — no schema
  change, just using the column that already exists.
- Strength exercises already have add/remove-set support today; no changes
  needed there.

## D — Video link in Logger

Add a "Watch demo" link/icon to each exercise row in both
`StrengthSetRow.tsx` and `MobilityChecklistRow.tsx`, reusing the existing
`Linking.openURL` pattern from Home's `handleOpenDemoVideo`.
`demoVideoUrl` is already threaded through `LoggerExercise` — this is a
pure rendering addition, no data-layer change.

## E — Session banner fix + Live Activity

**Banner bug.** Root-cause why the DB-backed `ActiveSessionBanner` isn't
reliably reappearing after app close/reopen despite `_layout.tsx`
re-fetching on every foreground transition. This needs actual debugging
during implementation (candidates to check first: a race between
navigation mount and the fetch resolving, a stale closure over
`activeSession` state, or the foreground-transition listener not firing
reliably) — not something to resolve at design time.

**Live Activity (lock-screen/cross-app banner).** Original research (during
brainstorming) pointed at `expo-live-activity` (software-mansion-labs) +
`expo-apple-targets`. Re-checked immediately before implementation and
found `expo-live-activity` is now marked **deprecated** by its own
maintainers, pointing at `expo-widgets` as the replacement — which turns
out to be the correct call anyway: `expo-widgets` is Expo's own
first-party module, promoted to **stable in Expo SDK 56** (the exact SDK
this project is on), so no third-party config-plugin/widget-extension
scaffolding is needed at all. Concrete steps:
1. Add the `expo-widgets` and `@expo/ui` packages (the latter provides the
   `@expo/ui/swift-ui` primitives — `Text`, `VStack`, `Image`, style
   modifiers — that a Live Activity's layout is built from) plus
   `expo-widgets`'s config plugin entry in `app.json`.
2. Raise the iOS deployment target to 16.2+ via the `expo-build-properties`
   plugin (`{ "ios": { "deploymentTarget": "16.2" } }`) — Expo's own docs
   route this through `expo-build-properties`, not a bare `ios.deploymentTarget`
   field in `app.json`.
3. Define the Live Activity as its own component module using the
   `'widget'` directive and `createLiveActivity`, per Expo's documented
   pattern — this compiles to a native SwiftUI view, not a regular RN
   screen.
4. Run `expo prebuild` to generate the native `ios/` project and the
   widget extension target (this project has never had a native `ios/`
   dir before — first time this repo goes through prebuild).
5. Produce a real `development`-profile EAS build (the profile already
   exists in `eas.json`, unused until now) and install it directly on
   device — Live Activities cannot run in Expo Go.
6. Wire the Live Activity's `.start()`/`.end()` calls into
   `sessionLifecycle.ts` alongside the existing `sessions.started_at`/`ended_at`
   writes, so its lifecycle always tracks the real session's lifecycle.
   Scoped to static content (session type, start time) updated only at
   start/end — not a live per-second ticking counter, since that needs a
   native SwiftUI timer-text API this pass didn't confirm is exposed
   through `@expo/ui/swift-ui`'s `Text`.

Sohan's explicit call: **no timebox** — see this through to completion
even if it's the long pole of item 1's 3-day window. Flagged as the
highest-risk, least-precedented piece of this spec (first native prebuild,
first real dev-client build on this project) so that risk is an explicit,
acknowledged choice rather than a surprise mid-implementation.

## Error handling

- Ad-hoc session creation respects the existing `sessions_one_active_per_owner`
  constraint — if one's already active (e.g. from a recommendation block),
  surface that clearly rather than letting the insert fail silently (same
  pattern `handleStartWorkout` already uses today).
- Unit conversion is a pure display/input transform — no new failure mode
  beyond standard numeric parsing already handled by the existing
  `TextInput` logic in `StrengthSetRow.tsx`.
- Mobility per-set writes reuse the exact `exercise_logs` insert/delete
  paths strength rows already use — same error handling (`deleteExerciseLog`,
  swipe-to-delete) applies unchanged.

## Non-goals

- No changes to the deterministic scoring engine or Claude program-builder
  — this spec is UI/logging-layer only.
- No offline/local cache of session state — the banner fix stays within
  the existing DB-re-fetch-on-foreground model, not a new persistence layer.
- Android is out of scope for the Live Activity (iOS-only concept); no
  Android equivalent is being built in this pass.

## Testing

- Unit tests for unit-conversion helpers (kg↔lbs) and for the mobility
  per-set write path, mirroring existing `StrengthSetRow`/`exerciseLogs`
  test coverage.
- Manual on-device verification for: Start button on Home, ad-hoc "+"
  flow end-to-end, banner reappearing after a real app close/reopen, and
  the Live Activity actually appearing on lock screen/Dynamic Island
  during a real workout — consistent with this project's existing
  practice of not declaring a feature done until it's been exercised on a
  real device (see the 2026-06-26/2026-07-05/2026-07-06 on-device
  verification passes in `CLAUDE.md`).
