# Stage 0 — Fixes and small asks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reported/parked bugs and ship the three small asks (eye-icon descriptions, prefilled assessments, last-assessment peek).

**Architecture:** Pure helpers in `apps/mobile/lib/` (unit-tested with jest, Supabase mocked), thin data-layer functions next to them, UI changes in existing components. No schema changes.

**Tech Stack:** Expo SDK 56, React Native 0.85, expo-router, supabase-js v2, jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-11-08-finish-the-app-design.md` §3 Stage 0.

## Global Constraints

- All paths below are relative to `apps/mobile/` unless they start with `supabase/` or `docs/`.
- **Never run anything that touches the network, Supabase, EAS, or the repo-root `.env`.** No `supabase` CLI, no `curl`, no scripts that read `.env`. The controller runs every live step. Only `npx jest`, `npx tsc --noEmit` are allowed.
- Every PostgREST embed of `exercises` uses an explicit FK-constraint hint (`exercises!<table>_exercise_id_fkey(...)`).
- Styling uses the existing `lib/theme.ts` tokens (`COLORS`, `SPACING`, `RADII`, `TYPE`, `sharedStyles`); the visual redesign is Stage 4, so don't restyle anything else.
- Icons: use `@expo/vector-icons` `Ionicons` (ships with `expo`; import `import { Ionicons } from '@expo/vector-icons';`). Eye toggle = `eye-outline` (collapsed) / `eye-off-outline` (expanded), size 18, colour `COLORS.muted`, `hitSlop={8}`, `accessibilityLabel` "Show description"/"Hide description".
- Verification per task: `cd apps/mobile && npx jest <file>` then at the end `npx jest && npx tsc --noEmit`.
- Commit after each task with a conventional message ending in
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. Assessment prefill from a prior assessment whose definitions changed (a test key no longer defined, or a new test with no prior value) → only matching keys prefill; new tests stay empty and Submit stays disabled until filled.
2. Prior pass/fail value `0` (Fail) must prefill as Fail, not be treated as "empty" (falsy-zero bug).
3. Peek sheet with only one prior assessment → shows latest values with no change arrows; with none → "No assessment yet".
4. Discarding a sprint workout that never wrote completion must not touch the sprint day (don't null a `completed_at` set by an earlier saved workout — there can't be one, `sprint_day_id` is unique, but guard on the workout row's `sprint_day_id` only).
5. History keyset paging when two workouts share the exact same `ended_at` → neither skipped nor duplicated.

---

### Task 1: Hint every `exercises` embed + embed smoke script

**Files:**
- Modify: `lib/sprintLifecycle.ts` (`SPRINT_DAY_EXERCISE_SELECT` ~line 319, `fetchSwapCandidates` ~line 387)
- Modify: `lib/workouts.ts` (`fetchWorkout` select ~line 180)
- Create: `supabase/tests/embed_smoke.py`

- [ ] **Step 1:** Change embeds to constraint hints: `exercises!sprint_day_exercises_exercise_id_fkey ( name, evidence_rationale )` (adds the description for Task 3), `exercises!sprint_exercise_pool_exercise_id_fkey ( name )`, `exercises!workout_exercises_exercise_id_fkey ( name, exercise_type, unilateral, evidence_rationale )`. Grep `apps/mobile` for any other `exercises (` / `exercises!` embed and hint it the same way.
- [ ] **Step 2:** Update the mapping functions: `SprintDayExercise` gains `readonly description: string | null` (from `exercises.evidence_rationale`); `WorkoutExerciseRow` gains `readonly description: string | null`. Fix any test fixtures that construct these types.
- [ ] **Step 3:** Write `supabase/tests/embed_smoke.py`: reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env; holds a list of `(table, select)` pairs copied from the app (all selects in `lib/*.ts` that contain an embed `(`); for each, `GET {url}/rest/v1/{table}?select=...&limit=1` with the service key; prints PASS/FAIL per pair and exits 1 if any response is not HTTP 200 (PGRST201 = ambiguity). Standard library only (`urllib`). **Do not run it** — the controller does.
- [ ] **Step 4:** `npx jest && npx tsc --noEmit` → all pass.
- [ ] **Step 5:** Commit `fix: hint every exercises embed by FK name; add embed smoke test`.

### Task 2: `DescriptionToggle` component + use everywhere a description shows

**Files:**
- Create: `components/DescriptionToggle.tsx`
- Modify: `components/AssessmentForm.tsx`, `components/SprintDayChecklist.tsx`, `components/logger/ExerciseCard.tsx`

**Interfaces:**
- Produces: `export function DescriptionToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }): JSX.Element` and `export function useToggle(initial = false): [boolean, () => void]`. Callers put the button next to the title and render the description text only when `open`.

- [ ] **Step 1:** Implement the component per Global Constraints (icon names, sizes, labels). Returns `null`-safe: callers only render the button when there is description text.
- [ ] **Step 2:** AssessmentForm: per card, the title row = name + toggle; `instructions` and `targetDescription` render only when open (the `isSynthesized` warning stays always visible). Each card keeps its own open state (a small `AssessmentCard` subcomponent in the same file holding `useToggle`).
- [ ] **Step 3:** SprintDayChecklist: each exercise row shows the toggle when `exercise.description` is non-empty; open shows the description under the prescription line.
- [ ] **Step 4:** ExerciseCard: same, using `exercise.description`, between the title row and the Target line.
- [ ] **Step 5:** `npx tsc --noEmit` passes; commit `feat: eye-icon toggle for exercise and assessment descriptions`.

### Task 3: Prefilled assessments

**Files:**
- Modify: `lib/sprintAssessment.ts`, `lib/sprintAssessment.test.ts`, `components/AssessmentForm.tsx`, `app/sprint.tsx`

**Interfaces:**
- Produces:
  - `export interface PastAssessment { readonly assessmentId: string; readonly sprintId: string; readonly phase: 'baseline' | 'reassessment'; readonly cycleNumber: number; readonly completedAt: string; readonly results: AssessmentResultInput[] }`
  - `export async function fetchAssessmentHistory(painPointId: string, limit: number, excludeSprintPhase?: { sprintId: string; phase: 'baseline' | 'reassessment' }): Promise<PastAssessment[]>` — the user's completed assessments for that pain point, newest `completed_at` first. Query: `sprint_assessments` with `sprints!inner(pain_point_id, cycle_number)` filtered by `sprints.pain_point_id`, `completed_at not null`, ordered desc, limited (fetch `limit + 1` and drop the excluded one if present), then `sprint_assessment_results` for those ids in one `.in()` query. RLS already restricts to the owner.
  - `export function prefillDraft(definitions: readonly AssessmentDefinition[], past: PastAssessment | null): Map<string, AssessmentResultInput>` — only keys present in `definitions`; bilateral defs copy `valueLeft`/`valueRight`, others `valueSingle`; `null`/missing numbers stay `undefined`; `0` is kept.
  - AssessmentForm new props: `initialDraft?: Map<string, AssessmentResultInput>`, `prefilledFrom?: string | null` (ISO date).

- [ ] **Step 1: Failing tests** in `lib/sprintAssessment.test.ts`:
  - `prefillDraft copies left/right for bilateral and single for others` (BILATERAL_DEF with past `{valueLeft: 9, valueRight: 11}` → map entry `{testKey:'knee_to_wall', valueLeft:9, valueRight:11}`).
  - `prefillDraft keeps a 0 (fail) value` (pass/fail single def, past `valueSingle: 0` → `valueSingle === 0`).
  - `prefillDraft ignores past keys not in definitions and leaves new definitions empty` → map has no entry for the stale key and none for the new def; `isAssessmentComplete` false.
  - `prefillDraft(defs, null)` → empty map.
- [ ] **Step 2:** Run `npx jest lib/sprintAssessment.test.ts` → FAIL (not exported).
- [ ] **Step 3:** Implement `prefillDraft` and `fetchAssessmentHistory`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** AssessmentForm: `useState` initialised from `initialDraft ?? new Map()`; `TextInput`s become controlled (`value={draft value != null ? String(v) : ''}`) so prefilled numbers show; pass/fail chips already read draft. When `prefilledFrom` is set and the draft is non-empty, show a banner card at the top: `Prefilled from your {Mon D, YYYY} assessment — change anything that's different.` plus a `Clear all` link (`setDraft(new Map())`, hides the banner). Keep the numeric parse behaviour of `updateField` (decimal allowed; text like `9.` must not fight the user — keep a per-field raw-text state map so typing isn't reformatted mid-entry).
- [ ] **Step 6:** `app/sprint.tsx`: when definitions are loaded for `pending_baseline` or `pending_reassessment`, also call `fetchAssessmentHistory(sprint.painPointId, 1, { sprintId: sprint.id, phase: <current phase> })` (failure → no prefill, never blocks the form) and pass `initialDraft={prefillDraft(definitions, history[0] ?? null)}` and `prefilledFrom={history[0]?.completedAt ?? null}`. Same for `handleSelectPainPoint`. Give AssessmentForm a `key` that changes when the prefill arrives so its state initialises from it.
- [ ] **Step 7:** `npx jest && npx tsc --noEmit`; commit `feat: prefill assessments from the last one for that pain point`.

### Task 4: "Last assessment" peek sheet

**Files:**
- Create: `components/LastAssessmentSheet.tsx`
- Modify: `lib/sprintAssessment.ts` (+ test), `components/SprintDayChecklist.tsx`, `app/sprint.tsx`, `app/workout/[workoutId].tsx`, `lib/workouts.ts`

**Interfaces:**
- Consumes: `fetchAssessmentHistory`, `fetchAssessmentDefinitions`, `buildBeforeAfterComparison` (pass `previous.results` as "baseline", `latest.results` as "reassessment").
- Produces:
  - `export type ChangeVerdict = 'better' | 'worse' | 'same' | null;`
  - `export function changeVerdict(c: AssessmentComparison): ChangeVerdict` — null when either side missing; for `higher`/`lower` compare `single` if present, else the mean of left/right; for `symmetry` compare `|left - right|` (smaller is better); equal → `'same'`.
  - `export default function LastAssessmentSheet({ visible, painPointId, onClose }: { visible: boolean; painPointId: string | null; onClose: () => void })` — loads definitions + `fetchAssessmentHistory(painPointId, 2)` when opened; shows date + phase/cycle of the latest ("Cycle 2 baseline · Nov 8"), each test's latest value (`L 9 / R 11 cm`, `45 seconds`, `Pass`), and if a previous exists, the previous value and a coloured verdict (`better` = `COLORS.accent`, `worse` = `COLORS.danger`, `same` = `COLORS.muted`). States: loading spinner, error with working Retry, "No assessment yet".
  - `lib/workouts.ts`: `Workout` gains `readonly painPointId: string | null` — `fetchWorkout`'s select adds `sprint_days ( sprints ( pain_point_id ) )` (hint by FK name if PostgREST needs it: `sprint_days!workouts_sprint_day_id_fkey`).

- [ ] **Step 1: Failing tests** for `changeVerdict`: higher+single 30→45 → `'better'`; lower+single 5→7 → `'worse'`; symmetry L9/R12 → L10/R11 → `'better'`; missing previous → `null`; equal → `'same'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Build the sheet (bottom-sheet `Modal` like the existing swap sheet in `app/sprint.tsx`).
- [ ] **Step 6:** Add a `Last assessment` link on SprintDayChecklist's header row (new prop `onOpenLastAssessment: () => void`), wired in `app/sprint.tsx`. In the logger, when `workout.painPointId` is set, add an `Ionicons` `clipboard-outline` header-left-of-Finish button (in `screenOptions.headerRight`, a row with the icon then Finish) that opens the sheet.
- [ ] **Step 7:** `npx jest && npx tsc --noEmit`; commit `feat: peek at the last assessment from the sprint and the logger`.

### Task 5: Logger correctness fixes (parked items)

**Files:**
- Modify: `app/workout/[workoutId].tsx`, `components/logger/SetRow.tsx`, `lib/workouts.ts`, `lib/workouts.test.ts`

- [ ] **Step 1: Rest bar skipped.** Replace the `holdGenRef !== gen` check in `completeRow` with a `userHoldGenRef` that is bumped **only** in `startHoldFor` (a hold the user started). `applyHold` keeps bumping `holdGenRef` for nothing else that matters; remove `holdGenRef` if unused afterwards. Rest/switch start after a completion unless the user started a new hold meanwhile.
- [ ] **Step 2: `uncompleteRow` vs in-flight.** `uncompleteRow(setId)` first awaits `inFlightRef.current.get(setId)` (if any) before writing `completedAt: null`.
- [ ] **Step 3: ROM unit per exercise (M11).** Changing the ROM unit on any row of an exercise updates the draft unit of every row of that exercise and persists it for its completed rows via a new `export async function setRomUnitForExercise(workoutExerciseId: string, unit: 'cm' | 'deg' | 'in'): Promise<void>` (one `update` on `workout_sets` where `workout_exercise_id = id`). SetRow gets a new `onChangeRomUnit(unit)` prop used instead of editing its own row only.
- [ ] **Step 4: Faster start (M15).** `fetchPreviousSets(exerciseId)`: query `workout_exercises` with `workouts!inner(ended_at)`, filter `workouts.ended_at not null`, `.order('ended_at', { referencedTable: 'workouts', ascending: false })`, `.limit(1)`. If ordering by a referenced table isn't honoured for the top-level rows in this supabase-js/PostgREST version, keep the current client sort but add `.limit(20)` on a `created`-desc proxy — note which in the commit. `addExercisesToWorkout`: fetch all previous sets up front with `fetchPreviousSetsForExercises(ids)` (parallel), insert all `workout_exercises` rows in **one** insert returning `id, position`, then all `workout_sets` in **one** insert. Positions assigned in spec order.
- [ ] **Step 5: Discard reverts sprint completion (M18).** `discardWorkout(workoutId)`: first read the workout's `sprint_day_id`; if set, update `sprint_days.completed_at = null` for that id and `sprint_day_exercises.completed_at = null` where `sprint_day_id` = it, then delete the workout. Test in `lib/workouts.test.ts` with the existing mock pattern: with a sprint day id → the two updates happen before the delete; without → only the delete.
- [ ] **Step 6: Keyset history paging (M22).** `fetchWorkoutHistory(cursor: { endedAt: string; id: string } | null, limit: number)`: order `ended_at desc, id desc`; with a cursor add `.or(\`ended_at.lt.${c.endedAt},and(ended_at.eq.${c.endedAt},id.lt.${c.id})\`)`. Update callers: History's load-more passes the last item's `{endedAt, id}`; refresh/focus passes `null` with `limit = max(PAGE_SIZE, items.length)`; Workout tab passes `(null, 3)`. Test: cursor produces the `.or` filter string above.
- [ ] **Step 7: Retry buttons.** In `app/(tabs)/index.tsx`, `app/(tabs)/history.tsx`, `app/workout-summary/[workoutId].tsx` and the logger: every "Try again" shows a spinner while retrying (disable the button, label `Retrying…`) and on failure shows the new error message. `app/sprint.tsx` already re-enters the spinner — leave it.
- [ ] **Step 8:** `npx jest && npx tsc --noEmit` → all pass; commit `fix: rest bar, un-tick race, per-exercise ROM unit, faster start, discard revert, keyset history, retries`.

---

## Controller-only steps after the tasks (not for subagents)

1. `python -I supabase/tests/embed_smoke.py` with `.env` loaded → all PASS.
2. Opus review of the Stage 0 diff → fix wave.
3. `git push`.
