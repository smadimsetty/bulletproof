# Stage 2 — Routines + exercise library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Routines in folders (create/edit/start/save-from-workout/update-from-workout), a mobility-first exercise library with search and filters, and custom exercises.

**Architecture:** Additive migration (routine tables, `workouts.routine_id`, `exercises.owner_id`), owner-scoped RLS with parent-ownership checks, a `lib/routines.ts` data layer with pure helpers for diffing/building, and new screens under `app/routines/` and `app/library/`.

**Tech Stack:** Expo SDK 56, expo-router, supabase-js v2, jest.

**Spec:** `docs/superpowers/specs/2026-11-08-finish-the-app-design.md` §3 Stage 2, §5a ("Library / picker show mobility content + the user's own custom exercises only").

## Global Constraints

- Paths relative to `apps/mobile/` unless starting with `supabase/` or `docs/`.
- **No network / live commands** (no supabase CLI, curl, python, eas, npm install, git push, never read `.env`). Only `npx jest`, `npx tsc --noEmit`, git commit. The controller applies migrations and runs smoke tests.
- Every `exercises` embed carries an FK-constraint hint. New FKs to `exercises` make un-hinted embeds ambiguous.
- **Today `exercises` is readable by `anon` with `using (true)`.** Custom exercises must never be readable by anon or other users (Stage 3 widens to "referenced by a workout I can read" — not here).
- Every child table gets a parent-ownership `WITH CHECK` (FK checks bypass RLS — see `supabase/migrations/20261107130000_workouts_parent_ownership_checks.sql` for the pattern).
- "Mobility content" (library/picker default set) = `owner_id is null AND (id in (select exercise_id from sprint_exercise_pool) OR exercise_type in ('mobility_stretch','balance') OR is_corrective)`, plus `owner_id = auth.uid()`. Old gym rows stay readable (past workouts must render) but are never offered in browse/search/pick.
- Custom exercise `movement_pattern` (NOT NULL, check `squat|hinge|push|pull|core|mobility|balance`): map from exercise type — `mobility_stretch`→`mobility`, `balance`→`balance`, `strength`→`push` unless the user picks one (the form offers the 7 values for strength/plyometric, defaulting to `push`), `plyometric`→`squat`, `cardio`→`core`. Document as a controller call.
- Styling with `lib/theme.ts` tokens; Icons via `Ionicons`. Commit after each task (ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); no push.

## Review Focus

1. Starting a routine containing an exercise the user later deleted (custom) → the start skips it with a notice, never crashes or creates a set row for a missing exercise.
2. Deleting a folder with routines in it → routines move to Unfiled, not deleted.
3. "Update routine" prompt when the only change is set *values* (not count/exercises) → no prompt.
4. Deleting a custom exercise used in history → blocked with a clear message (FK prevents it; map error code `23503` to the message).
5. Exercise picker search with the old gym exercise names (e.g. "Bench Press") → no result unless it's the user's own custom exercise.

---

### Task 1: Migration — routines, custom exercises, exercises RLS

**Files:**
- Create: `supabase/migrations/20261108130000_routines_and_custom_exercises.sql`
- Modify: `supabase/tests/rls_smoke_workouts.py` (new checks; controller runs it)

- [ ] **Step 1:** In the migration:
  - `alter table exercises add column owner_id uuid references auth.users(id) on delete cascade, add column cloned_from_exercise_id uuid references exercises(id) on delete set null, add column description text;` (a user-entered description; the UI shows `description ?? evidence_rationale`).
  - Drop `anon_can_read_exercises` and `authenticated_read_exercises`; create `anon_read_global_exercises` (`to anon using (owner_id is null)`), `authenticated_read_exercises` (`to authenticated using (owner_id is null or owner_id = auth.uid())`), and `owner_write_exercises` for insert/update/delete `to authenticated` `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`. Inserts must set `owner_id` (column default `auth.uid()` is **not** added, so global seed inserts stay global — the client passes `owner_id` explicitly).
  - `routine_folders (id uuid pk, owner_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null check (length(name) between 1 and 60), position smallint not null default 0, created_at timestamptz default now())`.
  - `routines (id, owner_id …, folder_id uuid references routine_folders(id) on delete set null, title text not null check (length between 1 and 80), notes text, position smallint not null default 0, created_at, updated_at timestamptz not null default now())`.
  - `routine_exercises (id, owner_id …, routine_id uuid not null references routines(id) on delete cascade, exercise_id uuid not null references exercises(id), position smallint not null, target_sets smallint not null default 3 check (between 1 and 20), target_reps smallint, target_duration_s integer, target_weight_kg numeric(6,2), rest_s smallint check (between 0 and 600), notes text)`.
  - `alter table workouts add column routine_id uuid references routines(id) on delete set null;` and replace the `workouts.source` check with `('empty','sprint','routine','copy')` (find the existing constraint name in `20261107120000_create_workouts.sql`; drop + add).
  - RLS: `owner_all_<table>` policies; for `routines` the WITH CHECK also requires `folder_id is null or exists (select 1 from routine_folders f where f.id = folder_id and f.owner_id = auth.uid())`; `routine_exercises` requires the parent routine owned by `auth.uid()` **and** the exercise readable (`exists (select 1 from exercises e where e.id = exercise_id and (e.owner_id is null or e.owner_id = auth.uid()))`); `workouts` gains an extra **restrictive** policy or updated check so `routine_id` must be null or owned by the user (add as a new named policy `workouts_routine_owned` `as restrictive for all to authenticated with check (routine_id is null or exists (...))`); `workout_exercises` likewise gains a restrictive check that `exercise_id` is readable by the user.
  - Indexes on `routines(owner_id)`, `routine_exercises(routine_id)`, `exercises(owner_id)`.
- [ ] **Step 2:** Extend `supabase/tests/rls_smoke_workouts.py` with: user B cannot read A's custom exercise; anon cannot read any custom exercise; B cannot insert a routine into A's folder, a routine_exercise into A's routine, a routine_exercise / workout_exercise pointing at A's custom exercise, or a workout with A's `routine_id`. Follow the existing script's structure. **Do not run it.**
- [ ] **Step 3:** Commit `feat(db): routines, folders, custom exercises; tighten exercises read RLS`.

### Task 2: Data layer + pure helpers

**Files:**
- Create: `lib/routines.ts`, `lib/routines.test.ts`, `lib/library.ts`, `lib/library.test.ts`
- Modify: `lib/workouts.ts` (`WorkoutSource` adds `'routine' | 'copy'`; `Workout` gains `routineId: string | null`; `fetchExerciseCatalog` → uses `library.ts`), `lib/exerciseSearch.ts`

**Interfaces:**
- Produces (`library.ts`):
  - `export interface LibraryExercise { id: string; name: string; exerciseType: string|null; unilateral: boolean; defaultSets: number|null; bodyParts: string[]; equipment: string[]; isMine: boolean; description: string|null; demoVideoUrl: string|null }`
  - `export async function fetchLibrary(): Promise<LibraryExercise[]>` — two queries in parallel: global mobility content (filter per Global Constraints; the sprint-pool ids fetched from `sprint_exercise_pool` then `.or('id.in.(…),exercise_type.in.(mobility_stretch,balance),is_corrective.eq.true')` with `.is('owner_id', null)`) and `owner_id = me`; merged, de-duplicated, sorted by name.
  - `export interface LibraryFilter { query: string; bodyPart: string|null; exerciseType: string|null; equipment: string|null; mineOnly: boolean }`
  - `export function filterLibrary(list: readonly LibraryExercise[], f: LibraryFilter): LibraryExercise[]` — case-insensitive name contains; chips AND-ed.
  - `export function facetValues(list: readonly LibraryExercise[]): { bodyParts: string[]; types: string[]; equipment: string[] }` (sorted, unique).
  - `export interface CustomExerciseInput { name: string; exerciseType: 'strength'|'mobility_stretch'|'plyometric'|'balance'|'cardio'; unilateral: boolean; bodyParts: string[]; equipment: string[]; description: string|null; demoVideoUrl: string|null; movementPattern?: string }`
  - `export function movementPatternFor(input: CustomExerciseInput): string` (mapping in Global Constraints)
  - `export async function createCustomExercise(input): Promise<string>`, `updateCustomExercise(id, input): Promise<void>`, `deleteCustomExercise(id): Promise<void>` (23503 → `Error("This exercise is used in your history or a routine, so it can't be deleted.")`).
- Produces (`routines.ts`):
  - `export interface RoutineExercise { id: string; exerciseId: string; exerciseName: string; exerciseType: string|null; unilateral: boolean; position: number; targetSets: number; targetReps: number|null; targetDurationS: number|null; targetWeightKg: number|null; restS: number|null; notes: string|null }`
  - `export interface Routine { id: string; folderId: string|null; title: string; notes: string|null; position: number; exercises: RoutineExercise[] }`
  - `export interface RoutineFolder { id: string; name: string; position: number }`
  - `fetchRoutinesAndFolders(): Promise<{ folders: RoutineFolder[]; routines: Routine[] }>`, `fetchRoutine(id)`, `createFolder(name)`, `renameFolder(id, name)`, `deleteFolder(id)`, `moveFolder(id, position)`, `saveRoutine(input: { id?: string; folderId: string|null; title: string; notes: string|null; exercises: Omit<RoutineExercise,'id'|'exerciseName'|'exerciseType'|'unilateral'>[] }): Promise<string>` (update header; replace children: delete all `routine_exercises` then insert in order), `deleteRoutine(id)`, `moveRoutine(id, folderId)`.
  - `export function routineFromWorkout(w: Workout): { title: string; notes: string|null; exercises: … }` — completed **working** sets only; per exercise `targetSets` = number of set numbers (sided rows count once per set number), targets from the last completed set (`reps`, `durationS`, `weightKg`).
  - `export function routineDiffers(r: Routine, w: Workout): boolean` — true iff the ordered exercise id list or any exercise's set count (per `routineFromWorkout`) differs. Values alone don't count.
  - `export async function startRoutineWorkout(routine: Routine): Promise<StartResult>` — `startWorkout({ source: 'routine', title: routine.title, routineId })` then `addExercisesToWorkout` with `prescribedSets: targetSets` and `targetText` built from targets (`"3 × 10"`, `"2 × 45s"`, `"3 × 10 @ 40 kg"`); skips exercises that no longer exist (returns the skipped names via `StartResult` extension `skipped?: string[]`). `startWorkout` gains optional `routineId`.

- [ ] **Step 1: Failing tests:** `filterLibrary` (query + chips + mineOnly), `facetValues` unique/sorted, `movementPatternFor` mapping, `routineFromWorkout` (sided exercise with L/R rows for set 1–2 → `targetSets 2`; warm-ups excluded; incomplete sets excluded), `routineDiffers` (values-only change → false; added exercise → true; extra set → true), `deleteCustomExercise` 23503 mapping (mocked supabase).
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx jest lib/routines.test.ts lib/library.test.ts`).
- [ ] **Step 5:** Commit `feat: routines and library data layer`.

### Task 3: Library screens + custom exercise form + picker switch

**Files:**
- Create: `app/library/index.tsx`, `app/library/new.tsx` (create/edit via `?id=`), `components/library/FilterChips.tsx`, `components/library/ExerciseListRow.tsx`
- Modify: `components/logger/ExercisePickerSheet.tsx` (uses `LibraryExercise` + `filterLibrary`, adds "+ Create exercise" row → `/library/new?returnTo=picker`), `app/_layout.tsx` (register screens: `library/index` "Exercises", `library/new` "New exercise"), `app/exercise/[exerciseId].tsx` (Edit/Delete buttons when `isMine`)

- [ ] **Step 1:** Library list: search field, horizontally scrolling chip rows (body part, type, equipment, "Mine"), rows with name + type + body parts, tap → `/exercise/<id>`; header-right `+` → `/library/new`. Empty: "No exercises match."
- [ ] **Step 2:** Custom exercise form: name (required, ≤80), type segmented control (5 types, labels `Stretch/hold`, `Balance`, `Strength`, `Plyo`, `Cardio`), movement pattern picker only for strength/plyometric, unilateral switch, body parts + equipment as comma-separated text fields (trimmed, lowercased, de-duplicated), description, demo URL (must start with `https://` if given). Save → create/update → back. Delete (edit mode) with confirm.
- [ ] **Step 3:** Picker uses `fetchLibrary()`; the old gym rows disappear from it. When the picker's `+ Create exercise` returns, the new exercise is added to the workout (pass the new id back via a module-level `pendingPickedExerciseId` in `lib/library.ts` read by the logger on focus — simplest reliable channel with expo-router).
- [ ] **Step 4:** `npx tsc --noEmit`; commit `feat: exercise library, custom exercises, mobility-only picker`.

### Task 4: Routine screens + Workout tab integration

**Files:**
- Create: `app/routines/[routineId].tsx` (editor; `new` as id creates), `components/routines/RoutinesSection.tsx`, `components/routines/FolderSheet.tsx`
- Modify: `app/(tabs)/index.tsx`, `app/_layout.tsx`, `app/workout-summary/[workoutId].tsx`, `app/workout/[workoutId].tsx` (or `lib/workouts.ts` finish path)

- [ ] **Step 1:** RoutinesSection on the Workout tab under Start empty workout + sprint card: header "Routines" with `+ Routine` and `+ Folder`; folders as collapsible groups (`Unfiled` last), each routine card shows title, exercise names (first 3 + "+N"), and a `Start` button (guarded by a ref against double taps; uses `handleStartResult`; shows an Alert listing `skipped` names if any). Long-press a routine → action sheet: Edit, Move to folder, Delete. Long-press a folder → Rename, Delete (confirm: "Routines inside move to Unfiled"). An `Exercises` link opens the library.
- [ ] **Step 2:** Routine editor: title, notes, exercise list (add via `ExercisePickerSheet`, remove, move up/down buttons), per exercise steppers/inputs for target sets and the kind-appropriate target (reps / hold seconds / duration / weight in user unit + reps), rest seconds; folder picker; Save (validates title + ≥1 exercise).
- [ ] **Step 3:** Workout summary: `Save as routine` button → `routineFromWorkout` → `saveRoutine` → toast/Alert "Saved to Routines".
- [ ] **Step 4:** On finish of a workout with `routineId`: after a successful save, if `routineDiffers(fetchRoutine(routineId), savedWorkout)`, Alert "Update routine?" — `Update` (→ `saveRoutine` from `routineFromWorkout`, keeping folder/notes/rest values for exercises that still exist) / `Keep original`. A missing routine (deleted meanwhile) → no prompt.
- [ ] **Step 5:** `npx jest && npx tsc --noEmit`; commit `feat: routines on the Workout tab, editor, save/update from workouts`.

---

## Controller-only steps

`migration list` → `db push`; run the extended RLS smoke + embed smoke live; Opus review; fixes; `git push`.
