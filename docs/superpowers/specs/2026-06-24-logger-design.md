# Logger screen (Phase 6) — design spec

This is the design reference for Phase 6 of the v2 autonomous build
pipeline (`docs/superpowers/plans/2026-06-23-bulletproof-v2-pipeline.md`).
It refines `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s
"Phase 6 — Logger" subsection against the actual schema and code that
exist today (post-Phase 5), and documents the real Postgres
constraint-violation signature this phase must handle gracefully rather
than assuming its shape.

## Background

`apps/mobile/app/logger/[blockId].tsx` is still the Phase 3 stub — it
echoes the `blockId` route param and renders nothing else. Phase 5 (Home)
made the Home tab navigate into this route with a real
`recommendation_blocks.id`, and built `lib/homeProgram.ts`'s
`BlockExercise`/`ProgramBlock` shapes, but Home does not fetch a block's
own row standalone — the Logger screen, opened directly via deep link or
after an app restart mid-session, cannot assume it was handed the data via
navigation params; it must be able to fetch everything itself from
`blockId` alone. This phase replaces the stub with the real logging
screen: per-exercise set/checkbox rows with incremental saves to
`exercise_logs`, swap/remove/add-exercise, an explicit Start/End workout
flow against `sessions.started_at`/`ended_at`, a global persistent banner
in `app/_layout.tsx`, haptic feedback, a mid-session feel-rating control,
and a completion celebration — all built against the live schema
(`supabase/migrations/20260623144500_create_exercise_logs_and_daily_feedback.sql`,
`20260623145000_expand_sessions.sql`) and the live RLS policies
(`20260623145500_multi_user_rls.sql`).

## What the live schema actually looks like (read directly, not assumed)

- **`exercise_logs`** (`20260623144500_create_exercise_logs_and_daily_feedback.sql`):
  `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references
  auth.users(id) default auth.uid()`, `date date not null`,
  `recommendation_block_exercise_id uuid references
  recommendation_block_exercises(id)` (nullable — set for prescribed
  exercises, null for ad-hoc additions), `exercise_id uuid not null
  references exercises(id)`, `block_type session_type not null`,
  `completed boolean not null default false`, `set_number smallint`
  (nullable — used for strength rows, null for a mobility checklist item
  with no set concept), `reps_completed smallint` (nullable),
  `weight_kg numeric(6,2)` (nullable), `rpe smallint check (rpe between 1
  and 10)` (nullable, not surfaced in this phase's UI — out of scope, see
  Non-goals), `logged_at timestamptz not null default now()`, `notes text`
  (nullable). One row per logged set (strength) or per completed checkbox
  item (mobility/stretch) — confirmed by the column comment in
  `2026-06-23-bulletproof-v2-design.md`'s schema section.
- **`sessions`** (`20260622001745_create_sessions.sql` +
  `20260623145000_expand_sessions.sql`): pre-existing `date`, `type
  session_type`, `duration_minutes`, `notes`, plus this phase's
  `started_at timestamptz`, `ended_at timestamptz`, `felt_rating smallint
  check (felt_rating between 1 and 10)`, and `owner_id uuid not null
  references auth.users(id) default auth.uid()`.
- **The exact partial unique index, read verbatim from
  `20260623145000_expand_sessions.sql` line 21-23:**
  ```sql
  create unique index sessions_one_active_per_owner
    on sessions (owner_id)
    where (ended_at is null);
  ```
  This means: at most one `sessions` row per `owner_id` can have
  `ended_at IS NULL` at any time. A second `insert` attempting to start a
  new session while one is already active violates this index.
- **RLS** (`20260623145500_multi_user_rls.sql`): `owner_read_write_sessions`
  (`for all to authenticated using (owner_id = auth.uid()) with check
  (owner_id = auth.uid())`) and `owner_read_write_exercise_logs` (identical
  shape, on `exercise_logs`). Both tables are fully read/write for the
  signed-in owner's own rows — no service-role requirement for anything
  this phase does.
- **`recommendation_blocks`/`recommendation_block_exercises`**
  (`20260623144000_create_recommendation_blocks.sql`,
  `20260623145500_multi_user_rls.sql`): both `select`-only for
  `authenticated`, scoped transitively back to `recommendations.owner_id`
  — confirmed already by the Phase 5 design spec's "RLS confirmation"
  section; this phase reuses that confirmed contract, doesn't re-derive it.
  `recommendation_block_exercises` columns relevant to swap/remove:
  `exercise_id`, `exercise_order`, `prescribed_sets`, `prescribed_reps`,
  `prescribed_weight_note`, `is_unilateral_left_first`, `notes`,
  `swapped_from_exercise_id` (audit trail — nullable FK to `exercises`,
  written by this phase's swap action so a swapped row is traceable back
  to what it replaced).
- **`exercises`** (`20260622000809_create_exercises.sql` +
  `20260623142500_expand_exercises.sql`): `id`, `name`,
  `movement_pattern`, `demo_video_url`, `is_complex`, `exercise_type`
  (`'strength' | 'mobility_stretch' | 'plyometric' | 'balance' |
  'cardio'`), `target_goals text[]`, `body_parts text[]`,
  `evidence_rationale`, `equipment_needed text[]`, `default_sets`,
  `default_rep_range`, `unilateral`, `is_corrective`. 189 rows live
  per the Phase 1 seed (`20260624000000_seed_exercise_catalog_v2.sql`).

## A pre-existing RLS gap this phase must fix

`exercises` (`20260622000809_create_exercises.sql`) has exactly one RLS
policy:

```sql
create policy "anon_can_read_exercises"
  on exercises
  for select
  to anon
  using (true);
```

Read directly: this grants `select` **only to the `anon` role**, never to
`authenticated`. Postgres RLS policies are role-scoped via `to <role>` —
an `authenticated` request does not inherit an `anon`-scoped policy. The
mobile app's Supabase client, once a user is signed in, executes every
request as `authenticated`, not `anon`. This phase's catalog-browse
("+ Add an exercise") and swap-eligible-exercise queries both read
`exercises` directly as a signed-in user, so without a fix, every such
query would silently return zero rows under RLS (no error — RLS just
filters out everything, exactly the "Today's program hasn't generated
yet"-style silent-empty failure mode CLAUDE.md's friction-first principle
warns against, except now as a real bug, not a future state). This also
quietly affects Phase 5's existing `recommendation_block_exercises ->
exercises` nested-select join in `homeProgram.ts` — that join currently
works only because Supabase's anon key is used for the unauthenticated
case and `homeProgram.ts`'s caller is authenticated, meaning the nested
`exercises` columns (`name`, `demo_video_url`, `exercise_type`) **should
already be returning null/empty under strict RLS enforcement** for a
signed-in user today. This phase's Task 1 adds the missing
`authenticated`-role read policy on `exercises`, both fixing the new
catalog/swap queries and closing this latent Phase-5 gap as a side effect
(verified, not just asserted — Task 1 includes a live authenticated-client
read-back check).

## Goals

- Replace the Logger stub with a real screen, fetched standalone from
  `blockId` (not dependent on navigation params), rendering every
  exercise in the block as a `MobilityChecklistRow` (checkbox,
  `exercise_type === 'mobility_stretch' | 'balance'`) or `StrengthSetRow`
  (reps + weight inputs, "+ add set", `exercise_type === 'strength' |
  'plyometric'`) based on the exercise's `exercise_type`.
- Every row change (a checkbox tick, a completed set) incrementally
  upserts one `exercise_logs` row — never a single end-of-session bulk
  save. This is the actual "friction-first" behavior: each unit of
  progress survives an app kill or crash mid-workout.
- Swap (⇄) and remove (✕) on every exercise row; a global "+ Add an
  exercise" button at the bottom of the block, browsing the same
  `exercises` catalog, filtered the same way for both swap and add:
  same `movement_pattern`, intersecting `body_parts`, intersecting
  `target_goals` as the row being acted on (or, for "+ Add", the block's
  aggregate movement_pattern set).
- Explicit Start Workout / End Workout buttons writing
  `sessions.started_at`/`ended_at`. Start creates a new `sessions` row;
  End updates it. The DB's partial unique index is the actual enforcement
  mechanism — the UI's job is to handle the `23505` violation gracefully
  (prompt to finish/discard the existing session), not to out-guess the DB
  with a pre-check query that could race.
- A persistent app-wide banner in `app/_layout.tsx`, shown as a sibling to
  the `Stack` whenever a `sessions` row with `ended_at IS NULL` exists for
  the signed-in user — visible on every screen, not just the Logger.
- A haptic tick (`expo-haptics`) on every set-completion checkbox/button
  tap.
- A mid-session "How did that feel?" control (1-10 picker, mirroring
  `PainEntryRow`'s existing severity-button visual pattern) writing
  `sessions.felt_rating` — available once a session is active, not gated
  behind End Workout.
- A completion celebration (a simple in-screen state, not a new dependency)
  shown after End Workout succeeds.

## Non-goals (explicitly out of scope for this phase)

- **`exercise_logs.rpe`.** The schema has the column; this phase's UI
  exposes reps + weight + completed only. RPE entry is a reasonable
  future enhancement (Trends/progressive-overload work might want it) but
  isn't in the original v2 spec's Phase 6 bullet and would add a fourth
  input per set row for zero near-term consumer.
- **Editing/deleting a previously logged set after the fact** (e.g.
  reopening a finished session to correct a typo'd weight). The spec only
  asks for in-the-moment logging; a correction UI is a separate feature.
  A user can still re-log a set_number (this phase's upsert key, see
  Decision 4) to overwrite it while the session is active, which covers
  the in-the-moment "I mis-typed that, let me redo it" case without a
  dedicated edit affordance.
- **A real on-demand Claude swap call (`build_program_for_activity`).**
  That function is explicitly deferred (engine v2 phase Non-goals,
  reconfirmed by the Home screen design spec). This phase's swap is a
  pure catalog-query replacement of one `recommendation_block_exercises`
  row's `exercise_id` — no Claude call, no new rationale text, exactly
  the "Exercises are editable in the Logger" capability from the v2
  design spec's Decision 10, which is explicitly catalog-filter-based,
  not LLM-based.
- **Multi-block session lifecycle modeling.** A `sessions` row is started
  once per Start Workout tap and ended once per End Workout tap,
  independent of how many `recommendation_blocks` the user logs against
  during that window (e.g. logging both a Lower block and a Mobility
  block in one sitting under one session — a real, intended use case per
  the schema's `block_type` column on `exercise_logs`, not `sessions`).
  `sessions.type` is set from the *first* block opened in that session
  (Decision 6) and not changed if the user logs a second block under the
  same active session — `sessions.type` is a single-value column, schema
  predates this multi-block possibility, and changing it mid-session
  would misrepresent history with no clean alternative. This is a known,
  documented schema limitation, not a bug this phase can fix without a
  migration (out of scope here).
- **Reordering exercises within a block, or reordering blocks.** Not
  requested by the spec.
- **Any new Supabase migration beyond the one-line `exercises` RLS fix**
  (Task 1) and the `recommendation_block_exercises.swapped_from_exercise_id`
  audit-trail write (already-existing column, no migration needed — it's
  part of the original schema-v2 migration, confirmed in
  `2026-06-23-bulletproof-v2-design.md`'s "Schema v2" section, just unused
  by any code until this phase).
- **Demo-video playback inside the Logger.** Reuses Home's exact
  `Linking.openURL` pattern (Decision 9), no inline player, no new
  dependency.
- **Push notifications / background reminders for an abandoned active
  session.** The banner is the only "you have an active session" signal;
  no notification scheduling in this phase.

## Decisions

1. **The Logger fetches everything itself from `blockId`, never relying
   on navigation params.** `app/logger/[blockId].tsx` is reachable only
   via `useLocalSearchParams<{ blockId: string }>()` today (confirmed in
   the existing stub), and Expo Router's modal route can in principle be
   deep-linked or re-entered after a process restart, where no in-memory
   `ProgramBlock` object from Home's `fetchHomeData` exists. A new
   `lib/loggerBlock.ts` module's `fetchLoggerBlock(blockId: string)`
   queries `recommendation_blocks` (single row by `id`) joined to
   `recommendation_block_exercises` joined to `exercises`, mirroring
   `homeProgram.ts`'s existing nested-select shape exactly (same column
   list, same `exercises:exercise_id(...)` embed syntax) rather than
   inventing a second query shape for the same join. Also fetches today's
   already-logged `exercise_logs` rows for this block's exercises in the
   same load, so reopening a block mid-session shows prior progress
   instead of resetting to blank.
2. **`exercise_type` decides row component, with a documented
   strength-row fallback for `cardio`.** `MobilityChecklistRow` renders
   for `'mobility_stretch'` and `'balance'`; `StrengthSetRow` renders for
   `'strength'` and `'plyometric'`. `exercise_type` is nullable in the
   schema (`expand_exercises.sql`'s `check` constraint allows null since
   it's not `not null`) and `'cardio'`-tagged exercise rows are
   theoretically reachable via "+ Add an exercise" even though
   `exercise_catalog_repo.py`'s `BLOCK_TYPE_MOVEMENT_PATTERNS` never
   surfaces them server-side for upper/lower/mobility blocks today. A
   null or `'cardio'` `exercise_type` falls back to `StrengthSetRow` (the
   more general of the two rows — a set-count-and-reps model degrades
   gracefully for almost anything, where a checkbox model would lose
   weight/reps data entirely) rather than throwing or silently hiding the
   row.
3. **Incremental save = one upsert per row-state-change, not a save
   button.** `MobilityChecklistRow`'s checkbox tap calls
   `upsertExerciseLog` immediately with `completed: true/false`.
   `StrengthSetRow`'s "+ add set" appends a new set row in local state
   with empty reps/weight (not yet saved); the set is saved (upserted) on
   blur of its reps or weight field, or immediately on tapping a
   "mark set complete" checkbox if reps/weight were never touched (a
   bodyweight set with no weight to enter is still loggable as
   completed). This mirrors `dailyFeedback`/`settings.tsx`'s established
   distinction in this codebase between autosave-on-change controls
   (checkboxes, chips) and explicit-commit text fields (here: blur, not a
   separate Save button per set, since a per-set Save button multiplied
   across many sets would be the kind of friction CLAUDE.md explicitly
   warns against — blur is the lowest-friction "I'm done editing this
   field" signal React Native offers without a debounce timer).
4. **Upsert key: `(owner_id, recommendation_block_exercise_id,
   set_number)` for prescribed strength exercises;
   `(owner_id, recommendation_block_exercise_id)` (set_number always
   null) for prescribed mobility checklist items;
   `(owner_id, exercise_id, date, set_number)` for ad-hoc-added exercises
   (no `recommendation_block_exercise_id`).** The schema has no unique
   constraint enforcing any of this server-side (confirmed: `exercise_logs`
   in `20260623144500_create_exercise_logs_and_daily_feedback.sql` has only
   a primary key on `id`, no other unique index) — so "upsert" here is
   client-orchestrated: query for an existing matching row first, then
   `update` if found or `insert` if not, inside one helper function. This
   is a deliberate, documented choice to do the dedup logic in
   `lib/exerciseLogs.ts` rather than adding a unique-constraint migration,
   since a real partial-unique-index design for this table (mobility rows
   have no set_number; ad-hoc rows have no block_exercise_id; both would
   need different partial-index predicates) is more schema surgery than
   this phase's scope justifies for what's fundamentally a client-side
   convenience property (never logging two rows for "set 2 of exercise X
   today" by accident), not a data-integrity invariant the way the
   sessions one-active-session rule is.
5. **The DB-enforced single-active-session rule is handled via a typed
   error helper, not a pre-check query.** `lib/sessionLifecycle.ts`'s
   `startSession(...)` always attempts the `insert` directly (no
   `select`-then-insert race-prone pre-check). On failure, a pure helper
   `isActiveSessionConflict(error: PostgrestError | null): boolean`
   checks `error?.code === '23505'` — the exact Postgres
   `unique_violation` SQLSTATE code, confirmed against
   `sessions_one_active_per_owner`'s definition in
   `20260623145000_expand_sessions.sql` and against how `@supabase/
   supabase-js`'s `PostgrestError` surfaces the underlying Postgres error
   code on its own `.code` field (not `.message` string-matching, which
   would be fragile against incidental message wording changes). On a
   `true` result, the UI shows an inline message — "You already have an
   active session" — with two actions: "Resume it" (fetches the existing
   open session via `select * from sessions where ended_at is null`,
   which RLS scopes to the caller's own row, and routes the Logger into
   that session's context) and "Discard it" (an explicit `update sessions
   set ended_at = now() where ended_at is null`, closing the abandoned
   session so a fresh Start Workout can succeed). This is a real
   modal-style confirmation (`Alert.alert` with two buttons, React
   Native's built-in API, no new dependency), not a raw thrown error
   surfacing to the user, satisfying the phase goal's explicit
   "handle...gracefully" requirement.
6. **`sessions.type` is set once, from the block first opened under
   that session.** Start Workout writes `type` (the block's `block_type`),
   `started_at: now()`, `owner_id` (defaulted by the DB). If the user later
   opens a second block while the same session is still active (no End
   Workout in between), the existing session row is reused as-is (its
   `type` does not change) — see Non-goals for why changing it mid-session
   has no clean answer with the current schema.
7. **The persistent banner queries `sessions` directly on layout mount
   and on the same `AppState` foreground listener `app/_layout.tsx`
   already has for HealthKit/recommendations**, rather than introducing a
   new global state-management library (Context/Redux/Zustand) for one
   boolean-ish piece of cross-screen state. `app/_layout.tsx` gains one
   more `useState`/`useEffect` pair (`activeSession: ActiveSessionRow |
   null`), fetched via a new `lib/sessionLifecycle.ts` export
   `fetchActiveSession()`, following the exact same
   fetch-on-sign-in-and-on-foreground shape the file already has for
   `loadRecommendations` — not a new pattern, the same one applied to a
   second piece of state. The banner itself
   (`components/ActiveSessionBanner.tsx`) is a new small component
   (parallel to `DropdownAddSection`/`PainEntryRow`'s existing
   `components/` convention) rendered as a sibling to the root `<Stack>`,
   shown only when `activeSession` is non-null, displaying the session's
   `type` label (via the existing `labelForSessionType`) and elapsed time
   since `started_at`, with a tap target that navigates to
   `/logger/[blockId]` — but the banner does not itself know which
   `blockId` to route to (a session has no `block_id` column; it spans
   potentially multiple blocks per Decision 6's Non-goal). Tapping the
   banner routes to `/(tabs)` (the Home tab) instead, letting the user
   re-pick which block to resume logging — a one-tap-further but correct
   navigation, rather than guessing a `blockId` the schema doesn't record.
8. **Haptics: `Haptics.selectionAsync()` on every checkbox/set-completion
   tick, not `impactAsync`.** Verified against the live Expo SDK 56 docs
   (`expo-haptics`, fetched directly, not assumed from memory):
   `selectionAsync()` is documented for exactly this "a selection change
   has been registered" use case, which is a closer semantic match than
   `impactAsync`'s physical-collision framing for a logging checkbox/set
   tick. `npx expo install expo-haptics` adds the dependency (confirmed
   absent from `apps/mobile/package.json` today) — this matches the
   "install via expo install" convention already used for every other
   native module in this repo (`expo-apple-authentication`,
   `expo-location`, etc., all installed the same way per existing
   `package.json` entries). The haptic call is wrapped in a bare
   try/catch with no rethrow (a haptics failure — e.g. low-power mode on
   iOS, per the SDK docs' platform caveats — must never block or fail the
   actual `exercise_logs` write it accompanies).
9. **The mid-session "How did that feel?" control reuses
   `PainEntryRow`'s exact 1-10 stepped-button visual** (10 small square
   buttons, active state filled with `COLORS.accent`) rather than
   inventing a new picker style, extracted into its own small
   `components/FeltRatingPicker.tsx` (not a copy-paste duplicate of
   `PainEntryRow`'s severity row, since `PainEntryRow` is pain-entry-
   specific — body_part label, note field, remove action — none of which
   applies here; only the visual shape is shared, which is exactly DRY's
   boundary: shared look, different concern, separate component). Tapping
   a number immediately upserts `sessions.felt_rating` (autosave-on-tap,
   same rationale as every other single-tap control in this phase) and is
   rendered any time a session is active (not gated behind End Workout) —
   "mid-session" per the spec's wording means available *during*, not
   *only at the end of*, the session.
10. **The completion celebration is a full-screen `Modal` overlay with a
    short congratulatory message and a single "Done" dismiss button** —
    no animation library, no confetti package (no such dependency exists
    in this repo and CLAUDE.md's "no over-engineering" convention argues
    against adding one for a single celebratory screen). It shows
    immediately after a successful End Workout write, summarizing the
    session's duration (`ended_at - started_at`, formatted as
    "You trained for N minutes.") and, if set, the felt-rating. Dismissing
    it navigates back to the Home tab (`router.replace('/(tabs)')`) —
    the workout is over, there's nothing further to do in the Logger.
11. **Swap/remove/add all operate on `recommendation_block_exercises`
    rows directly (update/delete/insert), never on `exercises` (the
    global catalog) or `exercise_logs` (history is preserved
    independently — see point 12).** Swap: `update
    recommendation_block_exercises set exercise_id = :new_id,
    swapped_from_exercise_id = :old_id where id = :row_id`. Remove:
    `delete from recommendation_block_exercises where id = :row_id`.
    Add: `insert into recommendation_block_exercises (block_id,
    exercise_id, exercise_order, ...)` with `exercise_order` computed as
    `max(existing exercise_order in this block) + 1`. RLS allows none of
    this today — `recommendation_block_exercises`' only policy
    (`owner_read_recommendation_block_exercises`) is `for select`, not
    `for all` (confirmed by re-reading `20260623145500_multi_user_rls.sql`
    directly, not assumed from the Home design spec's summary, which only
    discussed the `select` policy because Home only ever reads). **Task 1
    of this phase's plan must also add `owner_write_recommendation_block_
    exercises` (`for insert/update/delete to authenticated`, scoped via
    the same `recommendation_blocks` → `recommendations.owner_id` join
    `using`/`with check` shape as the existing select policy) — without
    it, every swap/remove/add in this phase would fail at the RLS layer,
    not just the missing `exercises` read policy from the "pre-existing
    RLS gap" section above.** This is a second, separate RLS gap from the
    `exercises` read-policy gap, found by reading the actual policy
    definitions rather than assuming "select exists, so similar writes
    must too."
12. **Removing or swapping an exercise does not delete or modify any
    already-logged `exercise_logs` rows for it.** `exercise_logs.
    recommendation_block_exercise_id` stays a dangling reference (the
    column has no `on delete cascade`, confirmed in the migration —
    plain `references recommendation_block_exercises(id)` with default
    `on delete` behavior, which for this schema's read patterns is
    irrelevant since nothing cascades). History is what was actually
    done, independent of what the prescription later became — removing a
    prescribed exercise after already completing 2 of 3 sets must not
    erase those 2 logged sets. The UI's exercise-row rendering for the
    *current* block always reflects `recommendation_block_exercises`'
    live state (so a removed exercise simply disappears from the active
    list), while `exercise_logs` keeps growing as an append-mostly audit
    trail, exactly matching the spec's framing of `exercise_logs` as "the
    engine's primary recent-history signal."
13. **The "+ Add an exercise" catalog browser and the per-row swap picker
    share one component, `components/ExercisePickerSheet.tsx`**, taking a
    `filterPredicate: (exercise: CatalogExercise) => boolean` prop so the
    two call sites (swap: filter to the same `movement_pattern` and an
    intersecting `body_parts`/`target_goals` as the row being replaced;
    add: filter to the block's own aggregate `movement_pattern`s, no
    body_parts/target_goals narrowing since there's no "current" row to
    match against) compose the same bottom-sheet modal/search-list shell
    `DropdownAddSection`'s visual pattern established, instead of two
    near-identical bespoke components. `lib/exerciseCatalog.ts`'s
    `fetchExerciseCatalog()` fetches the full 189-row `exercises` table
    once per Logger-screen mount (small enough — confirmed 189 rows from
    CLAUDE.md's Status section — that client-side filtering by predicate
    is simpler and cheap enough not to need a server-side
    movement_pattern/body_parts query per swap action, mirroring
    `exercise_catalog_repo.py`'s own precedent of pulling a
    movement_pattern-scoped set and filtering matches in code rather than
    expressing an array-intersection in PostgREST query syntax).
14. **TypeScript types for new tables are hand-written interfaces**,
    matching every other lib file's existing approach (no generated
    Supabase types anywhere in this repo, confirmed by `home-screen-
    design.md` Decision 12's same finding) — `LoggerBlock`,
    `LoggerExercise`, `ExerciseLogRow`, `ActiveSessionRow`,
    `CatalogExercise`, composed per-module rather than one giant shared
    types file, consistent with `homeProgram.ts`/`swapOptions.ts`'s
    existing per-module-interface convention.
15. **No new components extracted for single-use screen sections** beyond
    the ones explicitly justified above (`ActiveSessionBanner`,
    `FeltRatingPicker`, `ExercisePickerSheet`, `MobilityChecklistRow`,
    `StrengthSetRow`) — the Start/End Workout buttons and the completion
    celebration modal are local JSX inside `[blockId].tsx`, matching
    Home's precedent of keeping single-screen-use pieces inline (Home
    design spec Decision 11) and only extracting what's either genuinely
    reusable (the picker sheet, used by both swap and add) or has
    independent logic worth isolating for testability (the checklist/set
    rows, which own real per-row save logic, not just static display).

## Verification bar

Same as the last three mobile phases — there is no RN component-render
test harness in this repo:

- Jest unit tests for every new pure function/helper: `lib/loggerBlock.ts`'s
  fetch-composition logic (mocked Supabase client, mirroring
  `homeProgram.test.ts`'s mocking convention exactly), `lib/exerciseLogs.ts`'s
  upsert-key-resolution logic, `lib/sessionLifecycle.ts`'s
  `isActiveSessionConflict` helper and `startSession`/`endSession`
  composition, `lib/exerciseCatalog.ts`'s filter-predicate composition
  (`buildSwapFilter`/`buildAddFilter` as pure functions taking a
  `CatalogExercise[]` and returning the filtered subset, tested with
  plain arrays, no Supabase mock needed for the filtering logic itself).
- `npx tsc --noEmit` from `apps/mobile/` — clean compile.
- `npm test --prefix apps/mobile` — full existing suite stays green.
- `npx expo export --platform ios` — a real bundle smoke test, same bar as
  the nav/settings/home phases.
- Manual/visual verification of the actual screen, the banner, and the
  haptic tick is out of scope for automated checks (no harness exists,
  and haptics specifically cannot be verified by a static `tsc`/Jest pass
  at all) — the Tester's job is reading the component code against this
  spec's stated behavior and the real schema/RLS, same precedent as the
  three prior mobile phases' review approach. The plan's final task calls
  out the haptics call sites explicitly so a human (Sohan, on-device) can
  confirm the physical tick independently of the automated bar.

## Critical files

- `apps/mobile/app/logger/[blockId].tsx` — the file being replaced.
- `apps/mobile/app/_layout.tsx` — gains the `activeSession` fetch/state and
  renders `ActiveSessionBanner` as a sibling to `<Stack>`; the existing
  auth-gate/HealthKit/recommendations effects must not be disturbed.
- `apps/mobile/lib/homeProgram.ts` — the nested-select query shape
  `lib/loggerBlock.ts` mirrors for its own single-block fetch.
- `apps/mobile/lib/theme.ts`, `apps/mobile/lib/sessionTypeLabels.ts` —
  reused, not extended.
- `apps/mobile/components/DropdownAddSection.tsx`,
  `apps/mobile/components/PainEntryRow.tsx` — the two existing visual
  patterns `ExercisePickerSheet` and `FeltRatingPicker` borrow from.
- `supabase/migrations/20260622000809_create_exercises.sql` — the
  `anon`-only RLS gap this phase's Task 1 fixes.
- `supabase/migrations/20260623145500_multi_user_rls.sql` — the
  `select`-only `recommendation_block_exercises` policy this phase's
  Task 1 extends with a write policy.
- `supabase/migrations/20260623144500_create_exercise_logs_and_daily_feedback.sql`,
  `20260623145000_expand_sessions.sql` — the live schema and the exact
  `sessions_one_active_per_owner` index definition this phase's
  constraint-handling logic is built against.
- `engine/exercise_catalog_repo.py` — the server-side catalog-filtering
  precedent `lib/exerciseCatalog.ts`'s client-side filtering mirrors in
  spirit (filter by movement_pattern via query, narrow further in code).
