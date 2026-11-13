# Adaptive Sprint Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 14-day sprint picker with a daily, assessment-driven, left/right-aware, progressive engine. Rules handle safety and progression, and Claude Haiku 5.5 adds personal judgment at three trigger points.

**Architecture:**
- **Rules engine:** a set of pure, jest-tested TypeScript modules in `apps/mobile/lib/engine/`.
  - The app builds each sprint day lazily on the day the user opens it, writing through RLS. This follows the existing client-side data-layer pattern in `lib/sprintLifecycle.ts`.
- **`sprint-coach` Edge Function:** the only place Claude is called, so the API key stays server-side.
  - It writes validated adjustments, summaries and recommendations back to Postgres as the calling user.
  - The app never waits on it.

**Tech Stack:**
- Expo / React Native (TypeScript), jest + ts-jest
- Supabase Postgres with RLS
- Supabase Edge Functions (Deno), using `npm:@anthropic-ai/sdk`

**Spec:** `docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md` (approved 2026-11-12). Read it first, including §8a.

**Deviation from spec §5.3, decided while planning:**
- The *rules* run in the app, not in an Edge Function. The spec left "where the pure module lives" to the builder.
- Reason: Deno isn't installed on this machine, while every existing sprint function and its 300+ tests are client-side jest. Keeping the rules there means one tested codebase.
- The key still never leaves the server, because only `sprint-coach` calls Claude.
- **Record this in the spec's §8a when the feature lands.**

## Global Constraints

- **Migrations and RLS:**
  - Every new personal table is owner-scoped. Child tables add a parent-ownership `WITH CHECK` (CLAUDE.md, 2026-11-07 FK-bypasses-RLS lesson).
  - Migrations are pushed by hand: run `npx supabase migration list --linked` first, then `npx supabase db push --linked`.
  - Re-run the live suites `supabase/tests/rls_smoke_workouts.py`, `rls_smoke_social.py` and `embed_smoke.py` afterwards, with `.env` loaded.
- **Embeds:** every embed of `exercises` uses the FK hint (e.g. `exercises!slot_ladder_exercise_id_fkey`) to avoid PGRST201.
- **Time ranges:** exactly `'5-10' | '10-20' | '20-30'` (minutes). Null means not asked yet and is treated as `'10-20'`.
- **Effort:** `'easy' | 'right' | 'hard'`. **Pain:** an integer 0–10, with no preselected value in the UI.
- **Progression constants** (spec §5.2):
  - pain > 5 → step back
  - `pain_area` matches the slot's area with pain ≥ 4 → step back
  - pain 3–5 → hold
  - logged < 80% of the prescription → hold
  - 2× `hard` → step back
  - 2× `right` → step up
  - `easy` with pain ≤ 2 and the prescription completed → step up
  - gap of 3–6 days → hold; ≥ 7 days → step back one; at most one step per slot per day
  - missing effort or pain → hold (spec §8a.3)
  - pain trending up (higher than 7 days earlier on 2 consecutive sessions) → hold everything
- **Priority floor:** `0.2`. **Symmetry target:** 90% (spec §8a.1).
- **Stretch dose cap:** at most 240 s of hold per `area` per day, for `mobility_stretch` slots.
- **Default model:** `claude-haiku-5-5`, read from the Edge secret `SPRINT_ENGINE_MODEL`. Every AI output is validated against allowed ids and ranges. Any failure or refusal falls back to rules.
- **Logger side order:** the weaker side first, plus 1 extra set on it, only when a side gap is flagged. Otherwise left-first, as today.
- **Content:** every ladder level of every slot keeps at least one Basic-tier exercise.
- **Shipping:** finishing means pushed to `origin/master`, the Edge Function deployed, EAS build + `eas submit` done, and CLAUDE.md and the handoff doc updated.

## Review Focus

1. **A user with no feedback rows at all** (never answered the check) must get a valid day every day, holding at the starting levels. Tested in Task 4.
2. **The time budget is smaller than the top-priority slot** (5–10 min with a long slot). The top slot is still included, and nothing else is. Tested in Task 5.
3. **A tier change leaves a ladder level with no allowed exercise.** Drop to the nearest lower level that has one, and never produce an empty slot. Tested in Tasks 5 and 8.
4. **Opening the same day twice, or on two devices at once,** must not duplicate exercise rows. The `built_at` claim makes the build idempotent. Tested in Task 6 (unit test of the claim logic plus the manual check).
5. **A one-sided test with only one side entered, or a test whose `target_value` is null,** contributes nothing rather than NaN. Tested in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261112120000_adaptive_engine_schema.sql` | new columns and tables, RLS, the `continue_sprint` RPC, in-flight sprint migration |
| `supabase/migrations/20261112130000_adaptive_engine_content.sql` | slots, areas, test links, targets and noise thresholds, ladders, for all 7 pain points |
| `supabase/tests/check_ladder_coverage.sql` | must return 0 rows: every slot/level has a Basic exercise; every template slot has a ladder |
| `docs/superpowers/content/2026-11-12-engine/` | source notes for every number, with defaults labelled |
| `apps/mobile/lib/engine/types.ts` | shared engine types (no imports) |
| `apps/mobile/lib/engine/assessmentPriority.ts` | test deficits, side gaps, slot priorities |
| `apps/mobile/lib/engine/progression.ts` | the daily progression rule and missed-day rule |
| `apps/mobile/lib/engine/dayPlanner.ts` | time estimates, slot fitting, exercise picking, side bias, "why today" text |
| `apps/mobile/lib/engine/retestRecommendation.ts` | rules stay/switch, noise-aware verdict |
| `apps/mobile/lib/sprintEngine.ts` | data layer: load inputs, build a day idempotently, init/continue a sprint |
| `apps/mobile/lib/sprintCoach.ts` | fire-and-forget client calls to `sprint-coach` |
| `supabase/functions/sprint-coach/{index,prompt,validate}.ts` | Claude calls; `prompt.ts` and `validate.ts` have zero imports so jest can test them |
| `apps/mobile/lib/sprintCoachPrompt.test.ts`, `sprintCoachValidate.test.ts` | jest tests importing `../../../supabase/functions/sprint-coach/*.ts` |
| Modified | `sprintLifecycle.ts`, `sprintTierRefit.ts`, `workouts.ts`, `previousValues.ts`, `sprintAssessment.ts`, `userSettings.ts`, `components/logger/FinishSheet.tsx`, `components/SprintDayChecklist.tsx`, `components/AssessmentSummary.tsx`, `app/sprint.tsx`, `app/(tabs)/index.tsx`, `app/onboarding.tsx`, `app/settings.tsx` |

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20261112120000_adaptive_engine_schema.sql`
- Modify: `supabase/tests/rls_smoke_workouts.py` (add checks)

**Interfaces — Produces (table and column names every later task uses):**
- `assessment_definitions` + `raw_direction text check (raw_direction in ('higher','lower'))`, `target_value numeric`, `noise_threshold numeric`.
  - All nullable. A `higher`/`lower` test gets `raw_direction` = its `better_direction` in this migration.
- `sprint_slots (pain_point_id text, slot_key text, area text not null, is_stretch boolean not null default false, primary key (pain_point_id, slot_key))`. Global; authenticated read.
- `assessment_slot_links (pain_point_id, test_key, slot_key, weight numeric not null check (weight > 0), primary key (pain_point_id, test_key, slot_key))`. Global; authenticated read.
- `slot_ladder (pain_point_id, slot_key, level smallint check (level >= 1), exercise_id uuid references exercises, alt_rank smallint not null, step smallint check (step >= 1), sets smallint not null, reps_or_duration text not null, primary key (pain_point_id, slot_key, level, exercise_id, step))`. Global; authenticated read.
- `sprint_slot_state (sprint_id uuid references sprints on delete cascade, slot_key text, level smallint not null default 1, step smallint not null default 1, right_streak smallint not null default 0, hard_streak smallint not null default 0, last_done_on date, primary key (sprint_id, slot_key))`.
  - Owner policy through `sprints.owner_id = auth.uid()`, in both `using` and `with check`.
- `sprint_days` + `built_at timestamptz`, `why_today text`, `progressed_at timestamptz`. `progressed_at` is set once that day's feedback and logs have been folded into slot state.
- `sprint_day_exercises` + `level smallint`, `step smallint`, `lead_side text check (lead_side in ('left','right'))`, `extra_side_set boolean not null default false`.
- `sprint_day_feedback`:
  - `reaction` becomes nullable.
  - Add `effort text check (effort in ('easy','right','hard'))`, `pain smallint check (pain between 0 and 10)`, `pain_area text`.
  - Backfill: good → (`easy`, 0), neutral → (`right`, 0), hurt → (`right`, 6).
- `sprints` + `ai_summary text`, `retest_recommendation jsonb`. The JSON shape is `{ "choice": "stay"|"switch", "reason": string, "suggested_pain_point_id": string|null, "source": "ai"|"rules" }`.
- `sprint_ai_adjustments (id uuid pk, sprint_id uuid references sprints on delete cascade, slot_key text not null, kind text check (kind in ('start','pain')), level_override smallint, prefer_exercise_ids uuid[] not null default '{}', avoid_exercise_ids uuid[] not null default '{}', priority_delta smallint not null default 0 check (priority_delta between -1 and 1), note text, created_at timestamptz default now(), consumed_at timestamptz)`.
  - Owner policy through `sprints`.
- `engine_calls (id uuid pk, owner_id uuid not null default auth.uid() references auth.users, sprint_id uuid references sprints on delete set null, trigger text check (trigger in ('start','pain','retest')), model text not null, input_tokens int, output_tokens int, outcome text check (outcome in ('ok','fallback','error')), created_at timestamptz default now())`.
  - Owner select + insert only.
- `workout_exercises` + `lead_side text check (lead_side in ('left','right'))`.
- `user_settings` + `daily_time_range text check (daily_time_range in ('5-10','10-20','20-30'))`.
- RPC `continue_sprint(p_old_sprint_id uuid, p_started_on date) returns sprints`, `security invoker`. In one transaction it:
  1. checks the old sprint has status `completed` and the caller owns it (via RLS)
  2. inserts a new sprint on the same pain point with `cycle_number + 1` and status `active`
  3. creates a `baseline` assessment whose results are copied from the old sprint's `reassessment`
  4. copies `sprint_slot_state` rows, with `last_done_on` kept
  5. inserts 14 `sprint_days` rows (dates p_started_on … +13, `built_at` null)
  - Grant to `authenticated` only, matching `switch_sprint`.
- **In-flight migration:** for sprints with status `active`, delete `sprint_day_exercises` on days where `date > current_date`, `completed_at is null`, and no `workouts.sprint_day_id` references the day. Leave `built_at` null on those days. Set `built_at = created_at` on every other existing `sprint_days` row that has exercises.

- [ ] **Step 1: Add the failing live checks to `rls_smoke_workouts.py`**, following that file's existing two-user pattern:
  - user B cannot select, insert or update user A's `sprint_slot_state`, `sprint_ai_adjustments` or `engine_calls`
  - user B cannot insert a `sprint_slot_state` row pointing at A's sprint (the parent-ownership check)
  - user B cannot call `continue_sprint` on A's sprint (expect an error)
  - A's `continue_sprint` on A's completed sprint returns an `active` sprint with 14 days and copied state
- [ ] **Step 2:** Run `python supabase/tests/rls_smoke_workouts.py` with `.env` loaded. Expected: the new checks FAIL, because the tables don't exist.
- [ ] **Step 3: Write the migration** exactly as in Interfaces.
- [ ] **Step 4: Push it.**
  1. Run `npx supabase migration list --linked`. It should show only `20261112120000` pending.
  2. Run `npx supabase db push --linked`.
  3. Re-run all three live suites. Expected: everything passes, including the new checks.
- [ ] **Step 5:** Commit: `feat(db): adaptive sprint engine schema`.

### Task 2: Engine content for all 7 pain points

**Files:**
- Create: `docs/superpowers/content/2026-11-12-engine/<pain_point>.md` (7 files), `supabase/migrations/20261112130000_adaptive_engine_content.sql`, `supabase/tests/check_ladder_coverage.sql`

**Interfaces — Consumes:** Task 1's tables. **Produces:** seeded rows for every `pain_points.id`.

Authoring rules (spec §6, §8a):
- **Slots:** one `sprint_slots` row per distinct `slot_key` in `sprint_day_template`.
  - `area` is a key from `lib/bodyParts.ts`.
  - `is_stretch` is true when the slot's exercises are `mobility_stretch`.
- **Tests:** every `assessment_definitions` row gets a numeric `target_value` and a `noise_threshold`, in the test's unit.
  - Symmetry tests also get `raw_direction`.
  - Take the target from the existing `target_description` text where it gives a number. Example: knee-to-wall "9–12 cm" → 10.
- **Links:** every test links to ≥ 1 slot, and every slot is linked from ≥ 1 test. Weights are 0.5–2.
- **Ladders:**
  - Each slot has 2–4 levels.
  - Existing pool rows become level 1 (by `default_rank`); harder existing rows can be level 2.
  - Each (level, exercise) has 2–3 steps that raise sets, then reps or hold.
  - Stretch slots' steps don't exceed a total of 240 s.
  - Alternates at the same level share a level number and differ in `alt_rank`.
- New exercises may be inserted into `exercises` the same way `20261109150500_new_sprints_and_basic_alternatives.sql` does it, with `cue`, `description`, `evidence_rationale`, `equipment_needed`, `unilateral` and `exercise_type`.
- Every number the evidence doesn't give is written as a labelled default in the content notes ("DEFAULT — clinical judgment").

- [ ] **Step 1: Write `check_ladder_coverage.sql`.** It's a single `select` that returns offending rows for any of:
  - a template slot with no `sprint_slots` row
  - a slot with no ladder rows
  - a (slot, level) with no exercise allowed at Basic tier (equipment keys only from the Basic set in `lib/equipmentTiers.ts`)
  - a test with null `target_value` or `noise_threshold`
  - a symmetry test with null `raw_direction`
  - a test with no link
  - a slot with no link
- [ ] **Step 2:** Run it against the linked database via `npx supabase db query --linked -f supabase/tests/check_ladder_coverage.sql`. (Use the same mechanism `check_basic_coverage.sql` used; read `docs/superpowers/reports/2026-11-10-morning-handoff.md` for it.) Expected: many rows, because nothing is seeded yet.
- [ ] **Step 3: Write the 7 content notes, then the seed migration.**
- [ ] **Step 4:** Push it (`migration list` first, then `db push`) and re-run `check_ladder_coverage.sql`. Expected: 0 rows. Also re-run `check_basic_coverage.sql`: 0 rows.
- [ ] **Step 5:** Commit: `content: engine ladders, targets and test links for all sprints`.

### Task 3: Assessment priorities (pure)

**Files:**
- Create: `apps/mobile/lib/engine/types.ts`, `apps/mobile/lib/engine/assessmentPriority.ts`
- Test: `apps/mobile/lib/engine/assessmentPriority.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export type Side = 'left' | 'right';
export type Direction = 'higher' | 'lower';
export interface EngineTest { testKey: string; betterDirection: Direction | 'symmetry'; rawDirection: Direction | null;
  targetValue: number | null; noiseThreshold: number | null; isBilateral: boolean; }
export interface TestResult { testKey: string; left: number | null; right: number | null; single: number | null; }
export interface SlotLink { testKey: string; slotKey: string; weight: number; }
export interface TestScore { testKey: string; deficit: number; weakerSide: Side | null; }
// assessmentPriority.ts
export function scoreTest(test: EngineTest, result: TestResult | undefined): TestScore;
export function slotPriorities(scores: readonly TestScore[], links: readonly SlotLink[]): Map<string, number>;
export function weakerSideBySlot(scores: readonly TestScore[], links: readonly SlotLink[]): Map<string, Side>;
export const PRIORITY_FLOOR = 0.2;
export const SYMMETRY_TARGET = 0.9;
```
- **Deficit:** the larger of the raw deficit (weaker side vs `targetValue`, by direction, as a fraction of the target, clamped 0–1) and, for bilateral tests, the symmetry shortfall `max(0, (0.9 − ratio) / 0.9)`.
  - `ratio` = weaker/stronger for `higher`, stronger/weaker for `lower`.
- **`weakerSide`** is set only when |L−R| > `noiseThreshold`.
- **Priority:** `Σ weight × (PRIORITY_FLOOR + deficit)`.
- **`weakerSideBySlot`:** takes the flagged side from the linked test with the largest deficit.

- [ ] **Step 1: Write the failing tests:**
  - `knee-to-wall L=8 R=12 target 10 noise 1.5 raw higher` → deficit `≈0.259` (the larger of the raw shortfall `(10−8)/10 = 0.2` and the symmetry shortfall `(0.9 − 8/12)/0.9 ≈ 0.259`) and weakerSide `'left'`.
  - The same with L=11 R=12 → weakerSide `null` (gap 1 ≤ 1.5).
  - A `lower` test (side hop seconds, target 10) with value 12 → deficit `0.2`.
  - Value at or above target → deficit `0`, so priority = weight × 0.2.
  - Result missing, or `targetValue` null → deficit 0, weakerSide null, never NaN (Review Focus 5).
  - Two links to one slot → the weighted contributions add up.
- [ ] **Step 2:** Run `cd apps/mobile && npx jest lib/engine/assessmentPriority`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): assessment-driven slot priorities`.

### Task 4: Progression rule (pure)

**Files:**
- Create: `apps/mobile/lib/engine/progression.ts`
- Test: `apps/mobile/lib/engine/progression.test.ts`

**Interfaces — Produces:**
```ts
export interface SlotState { slotKey: string; level: number; step: number; rightStreak: number; hardStreak: number; lastDoneOn: string | null; }
export interface LadderShape { /* per slot */ maxLevel: number; stepsAt(level: number): number; }
export interface DayFeedback { effort: 'easy' | 'right' | 'hard' | null; pain: number | null; painArea: string | null; }
export interface SlotOutcome { slotKey: string; area: string; completedFraction: number; } // logged / prescribed, 0..1+
export type ProgressionReason = 'pain_back' | 'pain_hold' | 'pain_trend' | 'incomplete' | 'hard' | 'hard_back'
  | 'right' | 'right_up' | 'easy_up' | 'no_feedback' | 'gap_hold' | 'gap_back';
export function progressSlot(state: SlotState, shape: LadderShape, outcome: SlotOutcome, fb: DayFeedback,
  painTrendUp: boolean, doneOn: string): { state: SlotState; reason: ProgressionReason; painFlag: boolean };
export function applyGap(state: SlotState, shape: LadderShape, today: string): { state: SlotState; reason: ProgressionReason | null };
export function isPainTrendingUp(history: readonly { date: string; pain: number }[]): boolean;
```
- **Step up:** `step + 1`; past the level's last step → next level, step 1; capped at `maxLevel`'s last step.
- **Step back:** the mirror of step up (at level > 1, back from step 1 → the previous level's last step), with a floor of level 1 step 1.
- **Streaks:** reset whenever the reason isn't the one they count.
- **`applyGap`:** days since `lastDoneOn`. 3–6 → hold; ≥ 7 → one step back for each full 7 days, at most 3 (spec §8a.2).
- **`isPainTrendingUp`:** the last 2 sessions each had pain greater than the most recent session at least 7 days before it.
- **`painFlag`:** true for `pain_back`.

- [ ] **Step 1: Write the failing tests,** one per row of the spec §5.2 table, plus:
  - `fb` with effort null or pain null → `no_feedback`, state unchanged except `lastDoneOn` (Review Focus 1)
  - `completedFraction` 0.79 → `incomplete`
  - easy + pain 2 + complete at the top of the ladder → stays put
  - `painArea` matches `area` with pain 4 → `pain_back`, painFlag true
  - `applyGap`: 10 days → one step back; 30 days → 3 steps back at most
  - `isPainTrendingUp` with [3, 4, 5] spaced 7 days apart → true
- [ ] **Step 2:** Run `npx jest lib/engine/progression`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): criteria-based progression rule`.

### Task 5: Day planner (pure)

**Files:**
- Create: `apps/mobile/lib/engine/dayPlanner.ts`
- Test: `apps/mobile/lib/engine/dayPlanner.test.ts`

**Interfaces — Consumes:** Tasks 3–4 types; `requiredTier`, `tierAllows` from `lib/equipmentTiers.ts`. **Produces:**
```ts
export type TimeRange = '5-10' | '10-20' | '20-30';
export const TIME_RANGE_BOUNDS: Record<TimeRange, { min: number; max: number }>; // minutes
export interface LadderRow { slotKey: string; level: number; exerciseId: string; altRank: number; step: number;
  sets: number; repsOrDuration: string; equipment: readonly string[] | null; unilateral: boolean; isStretch: boolean; }
export interface CandidateSlot { slotKey: string; area: string; order: number; isStretch: boolean; }
export interface PlannedExercise { slotKey: string; exerciseId: string; level: number; step: number; sets: number;
  repsOrDuration: string; leadSide: Side | null; extraSideSet: boolean; order: number; estSeconds: number; }
export interface DayPlan { exercises: PlannedExercise[]; whyToday: string; }
export function estimateSeconds(sets: number, repsOrDuration: string, unilateral: boolean): number;
export function planDay(input: {
  candidates: readonly CandidateSlot[]; offRhythm: readonly CandidateSlot[]; yesterdaySlots: ReadonlySet<string>;
  priorities: ReadonlyMap<string, number>; priorityDelta: ReadonlyMap<string, number>;
  states: ReadonlyMap<string, SlotState>; levelOverride: ReadonlyMap<string, number>;
  ladder: readonly LadderRow[]; tier: EquipmentTier | null; timeRange: TimeRange | null;
  lastDoneByExercise: ReadonlyMap<string, string>; prefer: ReadonlySet<string>; avoid: ReadonlySet<string>;
  weakerSideBySlot: ReadonlyMap<string, Side>; testNameBySlot: ReadonlyMap<string, string>; gapTextBySlot: ReadonlyMap<string, string>;
}): DayPlan;
```
- **Bounds:** `5-10` → {5, 10}, `10-20` → {10, 20}, `20-30` → {20, 30}. Null → `10-20`.
- **`estimateSeconds`:**
  - per set: reps × 3 s, or the hold seconds (parse "30s" or "1 min"), or a distance like "20m" → 30 s
  - plus 30 s rest between sets
  - ×2 when one-sided
- **Ranking:** candidates by `priority + priorityDelta × 0.5`, descending.
- **Fitting:**
  - Always take the first.
  - Add more while the total stays ≤ `max × 60`.
  - Then try off-rhythm slots that aren't in `yesterdaySlots`.
  - For stretch slots, drop holds beyond 240 s per area.
- **Picking the exercise for a slot:**
  - Use `levelOverride` if present, else the state's level.
  - Take the tier-allowed rows at that level, falling back to lower levels, never empty (Review Focus 3).
  - Exclude `avoid` unless that would leave nothing.
  - Prefer exercises in `prefer`, then the least recently done (absent from the map = never), then `altRank`.
  - Skip exercises already picked today unless there's no alternative.
  - Use the step row for `min(state.step, that exercise's step count)`.
- **Side bias:** if `weakerSideBySlot` has the slot and the exercise is one-sided, set `leadSide` and `extraSideSet = true`, with the extra set counted in the estimate.
- **`whyToday`:** one sentence from the top slot. With a side gap: `"${Side} side first, plus one extra set: your ${testName} gap is ${gapText}."` Otherwise: `"Focus today: ${testName}, your biggest gap to target."`

- [ ] **Step 1: Write the failing tests:**
  - `5-10` with a top slot estimated at 12 min → exactly that one slot (Review Focus 2)
  - `20-30` fills more slots than `10-20` for the same inputs
  - the stretch cap holds across two stretch slots in the same area
  - a tier with no allowed exercise at level 3 → a level-2 exercise is picked
  - two alternates at a level: the one done most recently loses (the rotation fix)
  - an exercise in `avoid` is skipped when an alternate exists
  - a weaker-side slot with a one-sided exercise → `leadSide`, `extraSideSet: true` and the exact `whyToday` string
  - a non-one-sided exercise in a weaker-side slot → `leadSide` null
- [ ] **Step 2:** Run `npx jest lib/engine/dayPlanner`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): daily planner with time budget, ladders and side bias`.

### Task 6: Engine data layer and lazy day build

**Files:**
- Create: `apps/mobile/lib/sprintEngine.ts`, `apps/mobile/lib/sprintEngine.test.ts`
- Modify:
  - `apps/mobile/lib/sprintLifecycle.ts`: `activateSprintAfterBaseline` now creates 14 day rows plus initial `sprint_slot_state`, with no exercise rows. `fetchTodaySprintDay` calls `ensureDayBuilt` before reading. Extend `SprintDayExercise` with `level`, `step`, `leadSide`, `extraSideSet`, and `SprintDay` with `whyToday`.
  - `apps/mobile/lib/sprintExercisePicker.ts`: delete `pickExerciseForSlot` / `slotsForDay` once unused. Keep `filterCandidatesByTier` if `focusSwap.ts` still uses it.

**Interfaces — Consumes:** Tasks 1–5. **Produces:**
```ts
export async function ensureDayBuilt(sprintId: string, date: string): Promise<void>;
export async function initSlotState(sprintId: string, painPointId: string): Promise<void>;
export function claimRows(builtAt: string | null): boolean; // pure helper: true when this caller should build
```
`ensureDayBuilt` does the following:
1. Loads the day. If `built_at` is set, it returns.
2. **Claims the day** with `update sprint_days set built_at = now() where id = $1 and built_at is null returning id`. No row returned → another caller is building it, so return.
3. **Loads the inputs:**
   - the day's template slots (candidates) and the off-rhythm slots (the pain point's other template slots)
   - `sprint_slots`, links, tests, and the latest assessment results for this sprint (baseline)
   - slot state, the ladder joined to `exercises` (FK-hinted)
   - the user's settings (tier, time range)
   - unconsumed `sprint_ai_adjustments`
   - feedback and logged sets for every earlier built-but-unprogressed day, to get `completedFraction` per slot from `workout_sets` vs prescribed sets × sides
   - pain history across the sprint
4. **Runs progression:** `applyGap` + `progressSlot` for each slot done on those days (and `no_feedback` for days with no feedback row), then upserts `sprint_slot_state`.
   - "Earlier built-but-unprogressed days" means `built_at is not null and progressed_at is null and date < $date`.
   - Set `progressed_at = now()` on each of them after the state upsert.
5. **Builds the plan:** `planDay` → inserts `sprint_day_exercises` and sets `why_today`. Marks the consumed adjustments with `consumed_at = now()`.
6. **On any error after the claim:** resets `built_at` to null on that day, then rethrows, so a retry can rebuild it.

- [ ] **Step 1: Write failing tests** with a mocked supabase client, following the pattern used in `sprintLifecycle.test.ts`:
  - `claimRows(null) === true`, `claimRows('2026-…') === false`
  - `ensureDayBuilt` returns without inserting when the claim update returns 0 rows (Review Focus 4)
  - when an insert throws, `built_at` is reset to null
- [ ] **Step 2:** Run `npx jest lib/sprintEngine`. Expected: FAIL.
- [ ] **Step 3:** Implement `sprintEngine.ts` and wire it into `sprintLifecycle.ts`.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: all pass, clean.
- [ ] **Step 5: Manual check** on the linked database with a throwaway test user, using the same throwaway-user approach as the live smoke suites. **Never run this against Sohan's account.**
  1. Start a sprint → 14 days, 0 exercise rows.
  2. Fetch today → exercises appear.
  3. Fetch again → same row count.
- [ ] **Step 6:** Commit: `feat(engine): lazy daily build with progression and AI adjustments`.

### Task 7: Logger — weaker side first and an extra set

**Files:**
- Modify:
  - `apps/mobile/lib/previousValues.ts`: `plannedRows(setCount, sided, leadSide?: Side | null, extraSideSet?: boolean)`
  - `apps/mobile/lib/workouts.ts`: `NewWorkoutExercise` gains `leadSide`, `extraSideSet`; `buildSprintWorkoutExercises` passes them; `addExercisesToWorkout` writes `workout_exercises.lead_side`; `sortSets(sets, leadSide)` orders the lead side first
- Test: `apps/mobile/lib/previousValues.test.ts`, `apps/mobile/lib/workouts.test.ts`

- [ ] **Step 1: Failing tests:**
  - `plannedRows(2, true, 'right', true)` → `[{1,right},{1,left},{2,right},{2,left},{3,right}]`
  - `plannedRows(2, true)` keeps today's left-first output
  - `sortSets` with `leadSide 'right'` puts right before left within each set number
- [ ] **Step 2:** Run `npx jest lib/previousValues lib/workouts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Also update the logger screen's call to `sortSets`, found via `grep -rn sortSets apps/mobile`.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(logger): weaker side first with an extra set`.

### Task 8: Swap within the level, "easier version", tier refit

**Files:**
- Modify: `apps/mobile/lib/sprintLifecycle.ts` (`fetchSwapCandidates`, `swapExercise`, new `stepDownExercise`), `apps/mobile/lib/sprintTierRefit.ts`, `apps/mobile/components/SprintDayChecklist.tsx` (or the swap sheet it opens)
- Test: `apps/mobile/lib/sprintTierRefit.test.ts`, `apps/mobile/lib/sprintLifecycle.test.ts`

**Interfaces — Produces:**
- `fetchSwapCandidates(painPointId, slotKey, level, excludingExerciseId)` returns the tier-allowed alternates at that level, each with the prescription for the current step.
- `stepDownExercise(sprintDayExerciseId: string, sprintId: string, slotKey: string): Promise<void>` applies one step back (Task 4's step-back helper, exported from `progression.ts` as `stepBack(state, shape)`). It rewrites today's row to the new level/step's exercise and prescription, and saves the state.
- `planTierRefit` only touches built, not-started rows. It picks a same-level alternate, falling back to the nearest lower level (Review Focus 3). Unbuilt days need nothing, because they'll be built with the new tier.

- [ ] **Step 1: Failing tests:**
  - refit at level 2 with no allowed level-2 exercise → a level-1 replacement
  - `stepBack` from level 2 step 1 → level 1 at its last step
- [ ] **Step 2:** Run `npx jest lib/sprintTierRefit lib/engine/progression`. Expected: FAIL.
- [ ] **Step 3:** Implement, and add an "Easier version" action to the swap sheet that calls `stepDownExercise`.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(sprint): level-aware swaps, easier version, tier refit`.

### Task 9: Feedback check (effort, pain, area)

**Files:**
- Modify: `apps/mobile/components/logger/FinishSheet.tsx`, `apps/mobile/lib/workouts.ts` (`FinishInput`, `finishWorkout`), `apps/mobile/lib/sprintLifecycle.ts` (`submitDayFeedback`)
- Test: `apps/mobile/lib/workouts.test.ts`

**Interfaces — Produces:**
- `FinishInput` replaces `reaction` with `effort: 'easy'|'right'|'hard'|null`, `pain: number|null`, `painArea: string|null`, keeping `reactionNote`.
- `submitDayFeedback(sprintDayId, effort, pain, painArea, note)`.
- `finishWorkout` writes feedback when either effort or pain is non-null. It returns `{ result: 'saved', painFlag: boolean }`, where `painFlag` = pain > 5, or `painArea` set with pain ≥ 4. Callers are updated.

**UI** (sprint workouts only, same visibility rule as today's reaction):
- Effort: three chips, "Easy", "About right", "Too hard".
- Pain: a row of 11 tappable numbers, 0–10, with nothing preselected.
- When pain ≥ 3: "Where?" chips listing the distinct `sprint_slots.area` values of the day's slots, shown with `lib/bodyParts.ts` labels, plus "Other".
- Keep the optional note.

- [ ] **Step 1: Failing tests:**
  - `finishWorkout` with `{effort:'easy', pain:null}` saves feedback with `pain` null
  - with both null, no feedback row is written
  - pain 6 → `painFlag` true
  - pain 4 + painArea `'ankle'` → `painFlag` true
- [ ] **Step 2:** Run `npx jest lib/workouts`. Expected: FAIL.
- [ ] **Step 3:** Implement the data change and the sheet UI.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(logger): effort and pain check`.

### Task 10: Daily time range setting

**Files:**
- Modify: `apps/mobile/lib/userSettings.ts` (`dailyTimeRange: TimeRange | null`), `apps/mobile/app/onboarding.tsx` (a new step after equipment, required to continue, mirroring the step-3 `canContinue` rule), `apps/mobile/app/settings.tsx` (a row + sheet like Equipment), `apps/mobile/app/(tabs)/index.tsx` (a one-time prompt when `dailyTimeRange === null`, mirroring the `equipmentTier === null` / `tierPromptShownRef` prompt)
- Create: `apps/mobile/components/TimeRangePicker.tsx`, with options from `TIME_RANGE_OPTIONS`
- Test: `apps/mobile/lib/userSettings.test.ts`

**Interfaces — Produces:** `export const TIME_RANGE_OPTIONS: readonly { range: TimeRange; title: string; subtitle: string }[]` in `lib/engine/dayPlanner.ts`:

| `range` | `title` | `subtitle` |
|---|---|---|
| `5-10` | 5–10 min | A quick daily dose |
| `10-20` | 10–20 min | The standard sprint |
| `20-30` | 20–30 min | Go deeper |

- [ ] **Step 1: Failing test:** `fromRow` maps `daily_time_range` to `dailyTimeRange`, null stays null, and `updateUserSettings({ dailyTimeRange: '5-10' })` writes the column.
- [ ] **Step 2:** Run `npx jest lib/userSettings`. Expected: FAIL.
- [ ] **Step 3:** Implement the settings field, picker, onboarding step, Settings row and one-time prompt.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(settings): daily time range in onboarding and Settings`.

### Task 11: `sprint-coach` Edge Function

**Files:**
- Create: `supabase/functions/sprint-coach/prompt.ts`, `validate.ts` (no imports in either), `index.ts`, `apps/mobile/lib/sprintCoach.ts`
- Test: `apps/mobile/lib/sprintCoachPrompt.test.ts`, `apps/mobile/lib/sprintCoachValidate.test.ts`

**Interfaces — Produces:**
```ts
// validate.ts
export interface CoachContext { trigger: 'start' | 'pain' | 'retest'; slotKeys: string[];
  allowedExerciseIdsBySlot: Record<string, string[]>; maxLevelBySlot: Record<string, number>;
  defaultLevelBySlot: Record<string, number>; painPointIds: string[]; }
export interface StartOutput { summary: string; slots: { slot_key: string; priority_delta: -1|0|1; start_level: number;
  prefer: string[]; avoid: string[] }[]; }
export interface PainOutput { slots: { slot_key: string; level: number; prefer: string[]; avoid: string[]; note: string }[]; }
export interface RetestOutput { choice: 'stay' | 'switch'; reason: string; suggested_pain_point_id: string | null; }
export function validateStart(raw: unknown, ctx: CoachContext): StartOutput | null;
export function validatePain(raw: unknown, ctx: CoachContext, currentLevelBySlot: Record<string, number>): PainOutput | null;
export function validateRetest(raw: unknown, ctx: CoachContext): RetestOutput | null;
// prompt.ts
export function systemPrompt(): string;                       // stable, cached: the rules summary + output rules
export function painPointBlock(input: unknown): string;       // stable per pain point, cached
export function userBlock(trigger: string, input: unknown): string;
export const OUTPUT_SCHEMAS: Record<'start' | 'pain' | 'retest', object>; // JSON Schemas for output_config.format
// apps/mobile/lib/sprintCoach.ts
export function requestCoach(trigger: 'start' | 'pain' | 'retest', sprintId: string): void; // fire-and-forget, never throws
```

**Validation rules:**
- `start_level` is clamped to default ±1 within 1..max.
- `pain` levels must be ≤ the current level and ≥ 1; a raise is clamped to the current level.
- Ids not in the allowed sets are dropped.
- Unknown `slot_key`s are dropped.
- Text is trimmed: `summary` ≤ 400 chars, `note` ≤ 160, `reason` ≤ 400.
- An unknown `suggested_pain_point_id` becomes null.
- Wrong top-level shape → null.

**`index.ts`:**
- `POST { trigger, sprintId }` with the caller's JWT. Create a Supabase client with the caller's `Authorization` header, so RLS scopes every read and write, then load the context.
- Call `client.messages.create` with:
  - `model: Deno.env.get('SPRINT_ENGINE_MODEL') ?? 'claude-haiku-5-5'`
  - `max_tokens: 2000`
  - `system`: `[systemPrompt(), painPointBlock(...)]`, each with `cache_control: {type:'ephemeral'}`
  - `output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMAS[trigger] } }`
- Check `stop_reason`: `refusal` or `max_tokens` → fallback.
- `JSON.parse` the text block, then validate. On success:
  - `start`: write `sprints.ai_summary` and `sprint_ai_adjustments` (kind `start`, `level_override` = start_level)
  - `pain`: write `sprint_ai_adjustments` (kind `pain`)
  - `retest`: write `sprints.retest_recommendation` with `source:'ai'`
- On any failure, write nothing except the log; rules apply on their own.
- Always insert an `engine_calls` row with the usage and outcome.
- Before writing `index.ts`, read the claude-api skill's `typescript/claude-api/README.md` and the structured-outputs section of `tool-use.md` to confirm the exact `output_config.format` shape. Don't use `messages.parse` (see the memory `feedback_messages_parse_needs_output_format`).

**Client triggers:**
- `requestCoach('start')` after `activateSprintAfterBaseline` and after `continue_sprint`.
- `requestCoach('pain')` when `finishWorkout` returns `painFlag`.
- `requestCoach('retest')` after the reassessment is submitted.
- Use `supabase.functions.invoke('sprint-coach', …)` with `.catch(() => {})`.

- [ ] **Step 1: Failing jest tests:**
  - `validateStart` clamps start_level 5 (default 2, max 4) → 3, and drops an unknown exercise id
  - `validatePain` rejects a raise
  - `validateRetest` nulls an unknown pain point
  - a non-object → null
  - `systemPrompt()` is identical across calls, so it can be cached
- [ ] **Step 2:** Run `npx jest lib/sprintCoach`. Expected: FAIL.
- [ ] **Step 3:** Implement `validate.ts`, `prompt.ts`, `index.ts` and `sprintCoach.ts`, and wire the three triggers.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Deploy and set secrets.**
  1. `npx supabase functions deploy sprint-coach`.
  2. `npx supabase secrets set SPRINT_ENGINE_MODEL=claude-haiku-5-5`.
  3. `ANTHROPIC_API_KEY` isn't in `.env`. If Sohan hasn't provided one, record it as a Sohan action in the handoff. The app works without it, on rules fallback.
  4. If the key is available, make one live call with the throwaway test user's sprint. Expected: an `engine_calls` row with outcome `ok` and `sprints.ai_summary` set.
- [ ] **Step 6:** Commit: `feat(engine): sprint-coach Edge Function (Haiku 5.5, rules fallback)`.

### Task 12: Retest — noise-aware summary, stay or switch

**Files:**
- Create: `apps/mobile/lib/engine/retestRecommendation.ts`
- Test: `apps/mobile/lib/engine/retestRecommendation.test.ts`, `apps/mobile/lib/sprintAssessment.test.ts`
- Modify:
  - `apps/mobile/lib/sprintAssessment.ts`: `changeVerdict(c, noiseThreshold?: number | null)` returns `'same'` when |after − before| ≤ the threshold
  - `apps/mobile/components/AssessmentSummary.tsx`: the label reads "No clear change" for `'same'`, plus a recommendation card
  - `apps/mobile/app/sprint.tsx`: Stay → `continue_sprint` RPC via a new `continueSprint(oldSprintId)` in `sprintLifecycle.ts`, then `requestCoach('start')`. Switch → the existing pain-point picker, with the suggested one highlighted.

**Interfaces — Produces:**
```ts
export function recommendStayOrSwitch(tests: readonly EngineTest[], retest: readonly TestResult[]):
  { choice: 'stay' | 'switch'; reason: string };
```
- **Rule:** `stay` if any test's `scoreTest` deficit is > 0 and its shortfall to target is > `noiseThreshold`, or any `weakerSide` is non-null. Otherwise `switch`.
- **Display:** `sprints.retest_recommendation` (AI) if present, else this rule result. Poll once after 5 s for the AI version; don't block on it.

- [ ] **Step 1: Failing tests:**
  - `changeVerdict` with a 1 cm change and noise 1.5 → `'same'`
  - `recommendStayOrSwitch`: a side gap of 3 cm with noise 1.5 → stay
  - everything at target and symmetric → switch
- [ ] **Step 2:** Run `npx jest lib/engine/retestRecommendation lib/sprintAssessment`. Expected: FAIL.
- [ ] **Step 3:** Implement the logic and UI.
- [ ] **Step 4:** Run `npx jest && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit: `feat(sprint): noise-aware retest and stay-or-switch`.

### Task 13: Sprint screens show the personalization

**Files:**
- Modify: `apps/mobile/components/SprintDayChecklist.tsx` and the sprint card on the Workout tab (`components/SprintCard.tsx`), `apps/mobile/app/sprint.tsx`

**Behaviour:**
- `whyToday` is shown above the day's list.
- Each exercise shows "Level N" with a step count ("Level 2 · step 1 of 3"; exact styling is the builder's call, using the `components/ui/` primitives).
- An exercise with `extraSideSet` shows "Weaker side: Left · +1 set".
- `sprints.ai_summary` shows on the sprint screen under the pain point name. Fall back to the rules template `"Your plan targets ${top test name} first, then ${second}."` when it's null.

- [ ] **Step 1:** Implement the display.
- [ ] **Step 2:** Run `npx jest && npx tsc --noEmit && npx expo export --platform ios`. Expected: pass, clean, export succeeds.
- [ ] **Step 3:** Commit: `feat(sprint): show why-today, levels, weaker side and plan summary`.

### Task 14: Ship

- [ ] **Step 1: Whole-branch verification:**
  - `npx jest`: all pass
  - `npx tsc --noEmit`: clean
  - `npx expo export --platform ios`: succeeds
  - the three live suites pass
  - `check_ladder_coverage.sql` and `check_basic_coverage.sql` return 0 rows
- [ ] **Step 2: Docs:**
  - Update CLAUDE.md "Status" with a 2026-11-12 entry.
  - Add the rules-in-app deviation and the `ANTHROPIC_API_KEY` status to the spec's §8a.
  - Write `docs/superpowers/reports/2026-11-12-adaptive-engine-handoff.md`, containing:
    - an on-device checklist: start a sprint; answer effort/pain; see the next day change; try a pain ≥ 6 day; the weaker-side set; change the time range; retest stay/switch
    - where each content default lives, for Sohan's review
    - Sohan's actions
  - Add a one-line entry to the build log.
- [ ] **Step 3:** Bump the app version to 1.4.0, then run `eas build --platform ios --profile production` and `eas submit --platform ios --latest`. Per the memories, EAS is the only test path, and submit is a separate step.
- [ ] **Step 4:** `git push origin master` and confirm it's on the remote.
