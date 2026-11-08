# Sub-project A — Logger + history: design spec

Part of `2026-11-07-mobility-logger-roadmap.md` (read that first for the
decisions this builds on). Approved by Sohan 2026-11-07.

## Goals

- Log any workout — started empty, or started from today's sprint day — with
  per-set inputs that fit the exercise type, live timers, and previous-values
  prefill.
- Persist as you go, so a killed app resumes the in-progress workout.
- Show a history list and a per-workout detail view.
- Replace the sprint checklist's tap-to-complete with "Start today's
  routine" → logger. Logging *is* completing the sprint day.

## Non-goals (A only)

Routines, custom exercises, exercise reordering, stats/charts, personal-best
toasts, RPE/discomfort *inputs* (columns exist; UI comes in C), offline
logging, anything social (visibility column exists, default `private`, not
user-editable in A), editing sets after a workout is saved (detail view can
edit title/notes and delete the whole workout only).

## 1. Navigation

- Tabs: **Workout** (`app/(tabs)/index.tsx`, retitled) · **History**
  (new `app/(tabs)/history.tsx`) · Trends · Settings (both untouched).
- New stack routes (outside tabs, registered in `app/_layout.tsx`'s
  protected group):
  - `app/workout/[workoutId].tsx` — the live logger. Header title = workout
    title; no back-swipe surprises: leaving the screen does NOT end the
    workout (the banner brings you back).
  - `app/history/[workoutId].tsx` — saved-workout detail.
  - `app/sprint.tsx` — the existing sprint flow, moved here from the Home
    tab (picker → baseline → day view → reassessment → summary) with only
    the changes in §5.
- **Workout tab** (a single ScrollView):
  1. "Start empty workout" primary button.
  2. Sprint card, by in-flight sprint state:
     - none → "Fix a pain point" + "Choose a pain point" → `/sprint`.
     - `pending_baseline` / `pending_reassessment` → "<Pain point> ·
       baseline due" (or "reassessment due") + button → `/sprint`.
     - `active` with today's day not completed → "<Pain point> · Day N of 14"
       + **Start today's routine** (starts a sprint workout, §5) + "View
       sprint" link → `/sprint`.
     - `active` with today completed → "Day N logged ✓" + "View sprint".
     - `active` with no row for today → "No routine scheduled today" +
       "View sprint".
  3. "Recent" — last 3 saved workouts (same row component as History),
     tap → detail. "See all" → History tab.
  - Pull-to-refresh; reloads on focus (`useFocusEffect`).
- **Active-workout banner** (`components/ActiveWorkoutBanner.tsx`, rendered
  in `app/_layout.tsx` above the Stack when signed in): visible whenever an
  in-progress workout exists AND the current route is not that workout's
  logger. Shows "<title> · N min" (ticks every 15s), tap → logger, × →
  confirm → discard. Uses the safe-area top inset (the 2026-07-07 notch bug).

## 2. Data model (migration `20261107120000_create_workouts.sql`)

```sql
create table workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  title text not null,
  notes text,
  source text not null check (source in ('empty','sprint')),
  sprint_day_id uuid unique references sprint_days(id) on delete set null,
  visibility text not null default 'private'
    check (visibility in ('private','followers','public')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index workouts_one_in_progress_per_owner
  on workouts (owner_id) where (ended_at is null);
create index workouts_owner_ended_at on workouts (owner_id, ended_at desc);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  sprint_day_exercise_id uuid references sprint_day_exercises(id) on delete set null,
  position smallint not null,
  target_text text,          -- e.g. sprint's "2x15" / "30s each side"; display only
  measure_rom boolean not null default false,
  notes text
);
create index workout_exercises_workout on workout_exercises (workout_id);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number >= 1),
  side text check (side in ('left','right')),  -- null = bilateral
  set_type text not null default 'working' check (set_type in ('warmup','working')),
  reps smallint check (reps >= 0),
  weight_kg numeric(6,2) check (weight_kg >= 0),
  duration_s integer check (duration_s >= 0),
  rom_value numeric(6,2),
  rom_unit text check (rom_unit in ('cm','deg','in')),
  rpe smallint check (rpe between 1 and 10),
  discomfort smallint check (discomfort between 0 and 10),
  completed_at timestamptz
);
create index workout_sets_exercise on workout_sets (workout_exercise_id);
```

RLS: enable on all three; one named policy per table,
`owner_all_<table>` — `for all to authenticated using (owner_id =
auth.uid()) with check (owner_id = auth.uid())`. (D adds separate
read policies alongside; never edit these.) The `exercises` table already
has `authenticated_read_exercises` — confirm, do not re-add.

Same migration: none for `sprint_days` — the link lives on
`workouts.sprint_day_id`. Deleting a sprint workout leaves the sprint day
completed (FK is on the workout side; nothing to revert).

## 3. Input fields per exercise type (pure: `lib/setFields.ts`)

`fieldsForExercise({ exerciseType, unilateral }) → { kind, sided }`

| `exercise_type` | kind | inputs per set |
|---|---|---|
| `strength` | `weight_reps` | weight (user unit) + reps |
| `plyometric` | `reps` | reps |
| `mobility_stretch`, `balance` | `hold` | duration (s) with hold timer |
| `cardio` | `duration` | duration (min:sec entry, no hold timer) |
| null / unknown | `reps` | reps |

`sided = unilateral`. Sided exercises render each set as two rows, **Left
then Right** (the program's left-first rule). If `measure_rom` is on for the
workout exercise, every row also shows a ROM input + unit (default `cm`;
unit chosen once per exercise, stored on each set).

## 4. Logger behavior

### Planned sets
When an exercise is added (empty workout via picker, or from a sprint day):
- set count = sprint `prescribed_sets` → else `exercises.default_sets` → else
  3 for `weight_reps`/`reps`, 2 for `hold`, 1 for `duration`.
- rows are inserted into `workout_sets` immediately with `completed_at =
  null` (sided → L+R row per set number).
- values prefilled from **previous values** (pure: `lib/previousValues.ts`):
  the most recent *saved* workout (`ended_at not null`) containing the same
  `exercise_id`; match previous completed sets by `(set_number, side)`;
  unmatched planned rows copy the previous exercise's last completed row
  of the same side; no history → hold rows default `duration_s` from
  `parseTargetSeconds(target_text)` (pure; handles "30s", "30 s", "45 sec",
  "1 min", "60s each side", "2x30s" → 30; otherwise null → 30), other kinds
  blank. A muted "prev: …" hint shows the previous row's values.

### Editing + completing
- Values edit locally. Tapping the row's ✓ writes values + `completed_at =
  now()` in one update. Un-ticking writes `completed_at = null` (values
  kept). Inputs on a completed row stay editable; an edit re-writes the row.
- A ✓ with an empty required field (reps for `reps`/`weight_reps`, duration
  for `hold`/`duration`) is rejected with an inline hint, no write.
- "+ Add set" inserts the next set number (L+R for sided), prefilled from
  the last row. Swipe/× on a set deletes it (renumbering is NOT done; gaps
  are fine, display uses list order).
- Long-press the set number toggles `warmup`/`working` ("W" badge).
- "+ Add exercise" (both workout sources) opens the exercise picker:
  search by name (case-insensitive substring), filter chips per
  `exercise_type`, list shows name + type; tap adds at the end.
- Per-exercise "⋯" menu: Toggle ROM measurement · Remove exercise
  (confirm; deletes its sets).

### Timers (pure state machine: `lib/workoutTimers.ts`, all deadlines as
absolute epoch ms so backgrounding can't drift)
- **Hold timer** (`hold` rows only): row shows ▶. Start → countdown from the
  row's `duration_s` (3s "get ready" lead-in first). On reaching 0:
  success haptic, row auto-completes with `duration_s` = target. Stop early
  → row completes with elapsed seconds (min 1). For sided exercises, when
  the Left row of a set completes via the timer, a 5s "Switch sides"
  countdown starts and then auto-starts the Right row.
- **Rest timer**: starts after any row completes, *except* between the Left
  and Right rows of the same set. Default 60s for `weight_reps`/`reps`,
  30s for `hold`/`duration`. Shown as a bottom bar with −15 / +15 / Skip;
  warning haptic at 0, then disappears. Starting a hold timer cancels rest.
- Only one hold timer at a time; starting another stops the current one
  (completing it with elapsed time).
- Haptics via `expo-haptics` (already a dependency). No audio.

### Starting, resuming, finishing
- `startWorkout({source, title, sprintDayId?})` inserts the `workouts` row.
  A unique-violation (`23505` on the in-progress index) → Alert "You already
  have a workout in progress" with **Resume** (navigate to it) / Cancel.
- Default titles: empty → "Morning workout" (<12:00), "Afternoon workout"
  (<17:00), "Evening workout"; sprint → "<Pain point> · Day N".
- **Finish** (header button) → finish sheet: title (editable), notes,
  and — for sprint workouts only — optional reaction (good / neutral /
  hurt) + note (written via existing `submitDayFeedback`). Save:
  1. If zero completed sets → Alert "No sets completed" with Discard /
     Keep logging. No save.
  2. Delete uncompleted `workout_sets` rows of this workout.
  3. Delete `workout_exercises` left with zero sets.
  4. Update `workouts`: `title`, `notes`, `ended_at = now()`.
  5. Sprint workouts: for each remaining workout exercise with a
     `sprint_day_exercise_id`, set that row's `completed_at = now()` (keeps
     the LRU picker's history correct); then existing `completeDay(...)`
     (handles the day-14 → `pending_reassessment` transition); then
     feedback if given.
  6. End Live Activity, navigate to the detail screen (replace).
  Any step's failure → Alert, sheet stays open with input intact; a retry
  re-runs the whole sequence (every step is idempotent).
- **Discard** (finish sheet + banner ×) → confirm → delete the `workouts`
  row (cascade). Sprint day stays not-completed.
- Resume: the logger route reloads full state from the DB
  (`fetchWorkout(id)`), so a killed app loses only un-ticked local edits.

### Live Activity
Restore the deleted `lib/workoutActivityBridge.ts` pattern (lazy
`require('../widgets/WorkoutActivity')`, iOS-only, try/catch, reattach via
`getInstances()`), driven by the in-progress-workout state in
`app/_layout.tsx`. Pass the workout title as `sessionTypeLabel` (prop name
kept to avoid touching the native widget) and "Started at h:mm".

### Cross-screen state
`lib/workouts.ts` exports `subscribeToActiveWorkoutChanges(cb)` and calls
listeners after start / finish / discard; `_layout.tsx` re-fetches
`fetchActiveWorkout()` on those events, on sign-in, and on foreground.

## 5. Sprint changes (`app/sprint.tsx`, `SprintDayChecklist`)

- Home's sprint logic moves to `app/sprint.tsx` unchanged except:
  - The day view drops per-exercise tap-to-complete and the "Complete day"
    button + feedback sheet. It keeps the exercise list, prescriptions,
    swap (still only for not-yet-completed exercises), and "Switch pain
    point". It adds **Start today's routine** (same action as the Workout
    tab's button). If a workout for today's sprint day is in progress, the
    button reads **Resume today's routine**.
  - Completed day keeps its "Day N logged ✓" state.
- `startSprintWorkout(day, painPointName)` (`lib/workouts.ts`): creates the
  workout (`source='sprint'`, `sprint_day_id`), then one `workout_exercises`
  row per `sprint_day_exercises` row in order (copy `exercise_id`,
  `sprint_day_exercise_id`, `target_text = prescribed_reps_or_duration`
  formatted as "<sets> × <text>" when sets present), then planned sets per §4.
  If a workout with this `sprint_day_id` already exists in progress → resume
  it instead of creating.

## 6. History

- `app/(tabs)/history.tsx`: saved workouts (`ended_at not null`), newest
  first, paged 30 at a time ("Load more"), grouped under week headers
  ("This week", "Last week", else "Week of Mon D MMM"; weeks start Monday,
  local time — pure `lib/historyGrouping.ts`). Row: title, date, duration
  (`ended_at − started_at`, "42 min"), "N exercises · M sets", "Sprint" tag
  when `source='sprint'`. Pull-to-refresh, reload on focus. Empty state:
  "No workouts yet — start one from the Workout tab."
- `app/history/[workoutId].tsx`: title, date, duration, notes; each exercise
  with its sets formatted by kind (pure `lib/setFormatting.ts`, user's
  weight unit via existing `units.ts`/`fetchWeightUnit`): "40 kg × 8",
  "× 12", "45 s", "L 45 s · R 40 s" for sided pairs, "+ 12 cm" when ROM,
  "W" prefix for warmups. Actions: Edit (title + notes, Save writes both),
  Delete (confirm → delete row → back).

## 7. Errors

- Initial screen loads may show the full-screen error + Try again state.
- Every *subsequent* action (tick, add, delete, finish, refresh) reports via
  `Alert` and never unmounts the screen or drops local input. This includes
  pull-to-refresh (closing the parked follow-up from the sprint pivot).
- Writes are awaited before local state flips (no optimistic UI except the
  timer display).

## 8. Testing + verification

- Unit tests (jest, node env, `jest.mock('./supabase')` pattern already used
  in the repo) for every pure module: `setFields`, `previousValues`
  (incl. `parseTargetSeconds`), `workoutTimers`, `historyGrouping`,
  `setFormatting`, default-title helper; plus the data-layer functions in
  `lib/workouts.ts` (start incl. 23505 mapping, finish sequence order and
  idempotency, sprint-workout creation mapping) with a mocked client.
- Migration verified live: `migration list --linked` → `db push --linked`
  → `migration list` again; then a read-only RLS check that an anonymous
  request sees zero `workouts` rows.
- Gates per task: `npx jest`, `npx tsc --noEmit`; at the end
  `npx expo export --platform ios` and a TestFlight build
  (`eas build` + `eas submit`) for Sohan's on-device review.
- Cleanup carried in: delete nothing in `widgets/` (it's revived).
