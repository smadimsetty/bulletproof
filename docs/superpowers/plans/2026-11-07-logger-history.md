# Logger + History (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobility-first workout logger (empty or sprint-day workouts, typed set inputs, hold/rest timers, previous-values prefill, Live Activity) plus a History tab, and route sprint-day completion through it.

**Architecture:** Three new owner-scoped Supabase tables (`workouts`, `workout_exercises`, `workout_sets`). All decision logic lives in small pure TS modules under `apps/mobile/lib/` with jest tests; `lib/workouts.ts` is a thin Supabase data layer that calls them; screens under `apps/mobile/app/` stay presentational + orchestration only.

**Tech Stack:** Expo SDK 56 / expo-router 56, React Native 0.85, React 19, supabase-js 2, jest 29 + ts-jest (node env), expo-haptics, expo-widgets.

**Spec:** `docs/superpowers/specs/2026-11-07-logger-history-design.md` (roadmap context: `docs/superpowers/specs/2026-11-07-mobility-logger-roadmap.md`). Read the spec before starting any task.

## Global Constraints

- All mobile work happens in `apps/mobile`. Run commands from there: `npx jest <path>`, `npx tsc --noEmit`.
- Expo changed: for any Expo API you are not sure of, read https://docs.expo.dev/versions/v56.0.0/ (per `apps/mobile/AGENTS.md`). Do not add new npm dependencies.
- Weight is stored in kg (`weight_kg`), converted only at display/input via `lib/units.ts` (`kgToDisplayUnit`, `displayUnitToKg`, `formatWeightForDisplay`) and `fetchWeightUnit()` from `lib/userPreferences.ts`.
- Style with `COLORS`, `SPACING`, `RADII`, `TYPE`, `sharedStyles` from `lib/theme.ts`. Plain `StyleSheet`, no styling libs.
- Errors after initial load: `Alert.alert('Error', err?.message ?? fallback)`; never unmount the screen or drop local input on an action failure.
- Supabase errors: `if (error) throw new Error(error.message);` (repo convention).
- Sided (unilateral) exercises always log **Left before Right**.
- **Do NOT run anything that talks to the live Supabase project or EAS** (no `npx supabase db push`, no `eas build`, no scripts that read the repo-root `.env`). The repo-root `.env` holds real production credentials; the orchestrator does all live steps. Tests must mock `./supabase`.
- Commit after each task with a `feat:`/`fix:`/`chore:` message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261107120000_create_workouts.sql` | 3 tables, indexes, RLS |
| `apps/mobile/lib/setFields.ts` | exercise type → input kind, set counts, rest defaults, required-field check |
| `apps/mobile/lib/previousValues.ts` | planned rows, target-seconds parsing, prefill from previous workout |
| `apps/mobile/lib/workoutTimers.ts` | hold / switch-sides / rest timer state machine (pure) |
| `apps/mobile/lib/setFormatting.ts` | human-readable set lines for history |
| `apps/mobile/lib/historyGrouping.ts` | week grouping + duration label |
| `apps/mobile/lib/workoutTitles.ts` | default titles + sprint target text |
| `apps/mobile/lib/exerciseSearch.ts` | client-side exercise filter |
| `apps/mobile/lib/finishPlan.ts` | pure "what to delete/complete on finish" |
| `apps/mobile/lib/workouts.ts` | Supabase data layer + active-workout change events |
| `apps/mobile/lib/workoutActivityBridge.ts` | Live Activity start/end (restored pattern) |
| `apps/mobile/components/ActiveWorkoutBanner.tsx` | in-progress banner |
| `apps/mobile/components/WorkoutListRow.tsx` | one history row |
| `apps/mobile/components/logger/SetRow.tsx` | one set row |
| `apps/mobile/components/logger/ExerciseCard.tsx` | one exercise + its rows |
| `apps/mobile/components/logger/RestBar.tsx` | rest countdown bar |
| `apps/mobile/components/logger/ExercisePickerSheet.tsx` | add-exercise modal |
| `apps/mobile/components/logger/FinishSheet.tsx` | finish modal |
| `apps/mobile/app/workout/[workoutId].tsx` | live logger screen |
| `apps/mobile/app/workout-summary/[workoutId].tsx` | saved workout detail |
| `apps/mobile/app/sprint.tsx` | sprint flow (moved from Home) |
| `apps/mobile/app/(tabs)/index.tsx` | Workout tab (rebuilt) |
| `apps/mobile/app/(tabs)/history.tsx` | History tab |
| `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/_layout.tsx` | tabs + routes + Live Activity wiring |
| `apps/mobile/components/SprintDayChecklist.tsx` | drop tap-to-complete, add Start routine |

---

### Task 1: Database migration (orchestrator applies it live)

**Files:**
- Create: `supabase/migrations/20261107120000_create_workouts.sql`

**Interfaces:** Produces tables `workouts`, `workout_exercises`, `workout_sets` exactly as below; later tasks select these column names.

- [ ] **Step 1: Write the migration**

```sql
-- Sub-project A (logger + history). See
-- docs/superpowers/specs/2026-11-07-logger-history-design.md section 2.
-- Owner policies are named owner_all_<table>; the social sub-project adds
-- separate read policies alongside these and must never edit them.

create table workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  title text not null,
  notes text,
  source text not null check (source in ('empty', 'sprint')),
  sprint_day_id uuid unique references sprint_days(id) on delete set null,
  visibility text not null default 'private'
    check (visibility in ('private', 'followers', 'public')),
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
  target_text text,
  measure_rom boolean not null default false,
  notes text
);
create index workout_exercises_workout on workout_exercises (workout_id);
create index workout_exercises_owner_exercise on workout_exercises (owner_id, exercise_id);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number >= 1),
  side text check (side in ('left', 'right')),
  set_type text not null default 'working' check (set_type in ('warmup', 'working')),
  reps smallint check (reps >= 0),
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  duration_s integer check (duration_s >= 0),
  rom_value numeric(6, 2),
  rom_unit text check (rom_unit in ('cm', 'deg', 'in')),
  rpe smallint check (rpe between 1 and 10),
  discomfort smallint check (discomfort between 0 and 10),
  completed_at timestamptz
);
create index workout_sets_exercise on workout_sets (workout_exercise_id);

alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sets enable row level security;

create policy owner_all_workouts on workouts
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all_workout_exercises on workout_exercises
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all_workout_sets on workout_sets
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

- [ ] **Step 2: Orchestrator only — apply live**

```bash
cd /c/Dev/Bulletproof
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
npx supabase migration list --linked     # expect only 20261107120000 pending
npx supabase db push --linked
npx supabase migration list --linked     # expect Local == Remote for 20261107120000
```
Then confirm anon sees nothing: `curl -s "$SUPABASE_URL/rest/v1/workouts?select=id" -H "apikey: $SUPABASE_ANON_KEY"` → `[]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261107120000_create_workouts.sql
git commit -m "feat: add workouts, workout_exercises, workout_sets tables"
```

---

### Task 2: Set-field rules (`setFields.ts`)

**Files:**
- Create: `apps/mobile/lib/setFields.ts`
- Test: `apps/mobile/lib/setFields.test.ts`

**Interfaces — Produces:**
```ts
export type SetKind = 'weight_reps' | 'reps' | 'hold' | 'duration';
export type RomUnit = 'cm' | 'deg' | 'in';
export type Side = 'left' | 'right' | null;
export interface SetFieldSpec { readonly kind: SetKind; readonly sided: boolean }
export interface SetValues {
  readonly reps: number | null; readonly weightKg: number | null; readonly durationS: number | null;
  readonly romValue: number | null; readonly romUnit: RomUnit | null;
}
export const EMPTY_SET_VALUES: SetValues;
export function fieldsForExercise(input: { exerciseType: string | null; unilateral: boolean }): SetFieldSpec;
export function defaultSetCount(kind: SetKind, prescribedSets: number | null, defaultSets: number | null): number;
export function defaultRestSeconds(kind: SetKind): number;
export function missingRequiredField(kind: SetKind, values: SetValues): string | null;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/setFields.test.ts
import { fieldsForExercise, defaultSetCount, defaultRestSeconds, missingRequiredField, EMPTY_SET_VALUES } from './setFields';

describe('fieldsForExercise', () => {
  test.each([
    ['strength', 'weight_reps'],
    ['plyometric', 'reps'],
    ['mobility_stretch', 'hold'],
    ['balance', 'hold'],
    ['cardio', 'duration'],
    [null, 'reps'],
    ['something_new', 'reps'],
  ])('%s -> %s', (type, kind) => {
    expect(fieldsForExercise({ exerciseType: type as any, unilateral: false })).toEqual({ kind, sided: false });
  });
  test('sided follows unilateral', () => {
    expect(fieldsForExercise({ exerciseType: 'balance', unilateral: true }).sided).toBe(true);
  });
});

describe('defaultSetCount', () => {
  test('prescribed wins', () => expect(defaultSetCount('hold', 4, 2)).toBe(4));
  test('then exercise default', () => expect(defaultSetCount('hold', null, 5)).toBe(5));
  test('ignores non-positive values', () => expect(defaultSetCount('reps', 0, 0)).toBe(3));
  test.each([['weight_reps', 3], ['reps', 3], ['hold', 2], ['duration', 1]])('%s fallback %i', (k, n) => {
    expect(defaultSetCount(k as any, null, null)).toBe(n);
  });
});

describe('defaultRestSeconds', () => {
  test.each([['weight_reps', 60], ['reps', 60], ['hold', 30], ['duration', 30]])('%s -> %i', (k, s) => {
    expect(defaultRestSeconds(k as any)).toBe(s);
  });
});

describe('missingRequiredField', () => {
  test('reps required for reps and weight_reps', () => {
    expect(missingRequiredField('reps', EMPTY_SET_VALUES)).toBe('Enter reps');
    expect(missingRequiredField('weight_reps', EMPTY_SET_VALUES)).toBe('Enter reps');
    expect(missingRequiredField('weight_reps', { ...EMPTY_SET_VALUES, reps: 8 })).toBeNull();
  });
  test('weight is optional (bodyweight)', () => {
    expect(missingRequiredField('weight_reps', { ...EMPTY_SET_VALUES, reps: 0 })).toBeNull();
  });
  test('duration required for hold and duration', () => {
    expect(missingRequiredField('hold', EMPTY_SET_VALUES)).toBe('Enter a duration');
    expect(missingRequiredField('duration', { ...EMPTY_SET_VALUES, durationS: 0 })).toBe('Enter a duration');
    expect(missingRequiredField('hold', { ...EMPTY_SET_VALUES, durationS: 30 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest lib/setFields.test.ts` → "Cannot find module './setFields'".

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/setFields.ts
//
// Which inputs a logged set shows, decided by the exercise's
// exercise_type (spec section 3). Pure -- no Supabase, no RN.
export type SetKind = 'weight_reps' | 'reps' | 'hold' | 'duration';
export type RomUnit = 'cm' | 'deg' | 'in';
export type Side = 'left' | 'right' | null;

export interface SetFieldSpec {
  readonly kind: SetKind;
  readonly sided: boolean;
}

export interface SetValues {
  readonly reps: number | null;
  readonly weightKg: number | null;
  readonly durationS: number | null;
  readonly romValue: number | null;
  readonly romUnit: RomUnit | null;
}

export const EMPTY_SET_VALUES: SetValues = { reps: null, weightKg: null, durationS: null, romValue: null, romUnit: null };

const KIND_BY_TYPE: Record<string, SetKind> = {
  strength: 'weight_reps',
  plyometric: 'reps',
  mobility_stretch: 'hold',
  balance: 'hold',
  cardio: 'duration',
};

export function fieldsForExercise(input: { exerciseType: string | null; unilateral: boolean }): SetFieldSpec {
  const kind = (input.exerciseType && KIND_BY_TYPE[input.exerciseType]) || 'reps';
  return { kind, sided: input.unilateral };
}

const FALLBACK_SET_COUNT: Record<SetKind, number> = { weight_reps: 3, reps: 3, hold: 2, duration: 1 };

export function defaultSetCount(kind: SetKind, prescribedSets: number | null, defaultSets: number | null): number {
  if (prescribedSets != null && prescribedSets > 0) return prescribedSets;
  if (defaultSets != null && defaultSets > 0) return defaultSets;
  return FALLBACK_SET_COUNT[kind];
}

export function defaultRestSeconds(kind: SetKind): number {
  return kind === 'weight_reps' || kind === 'reps' ? 60 : 30;
}

export function missingRequiredField(kind: SetKind, values: SetValues): string | null {
  if (kind === 'reps' || kind === 'weight_reps') {
    return values.reps == null ? 'Enter reps' : null;
  }
  return values.durationS == null || values.durationS <= 0 ? 'Enter a duration' : null;
}
```

- [ ] **Step 4: Run, expect PASS** — `npx jest lib/setFields.test.ts`.
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/setFields.* && git commit -m "feat: add set-field rules per exercise type"`

---

### Task 3: Planned rows + previous-values prefill (`previousValues.ts`)

**Files:**
- Create: `apps/mobile/lib/previousValues.ts`
- Test: `apps/mobile/lib/previousValues.test.ts`

**Interfaces:**
- Consumes: `SetKind`, `SetValues`, `Side`, `EMPTY_SET_VALUES` from `./setFields`.
- Produces:
```ts
export interface PlannedRow { readonly setNumber: number; readonly side: Side }
export interface PreviousSet extends SetValues { readonly setNumber: number; readonly side: Side }
export function plannedRows(setCount: number, sided: boolean): PlannedRow[];
export function parseTargetSeconds(text: string | null): number | null;
export function previousMatch(row: PlannedRow, previous: readonly PreviousSet[]): PreviousSet | null;
export function prefillValues(row: PlannedRow, previous: readonly PreviousSet[], kind: SetKind, targetText: string | null): SetValues;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/previousValues.test.ts
import { plannedRows, parseTargetSeconds, previousMatch, prefillValues, type PreviousSet } from './previousValues';
import { EMPTY_SET_VALUES } from './setFields';

const prev = (setNumber: number, side: 'left' | 'right' | null, v: Partial<PreviousSet>): PreviousSet => ({
  ...EMPTY_SET_VALUES, setNumber, side, ...v,
});

describe('plannedRows', () => {
  test('bilateral', () => {
    expect(plannedRows(2, false)).toEqual([{ setNumber: 1, side: null }, { setNumber: 2, side: null }]);
  });
  test('sided is left then right per set', () => {
    expect(plannedRows(2, true)).toEqual([
      { setNumber: 1, side: 'left' }, { setNumber: 1, side: 'right' },
      { setNumber: 2, side: 'left' }, { setNumber: 2, side: 'right' },
    ]);
  });
  test('zero sets -> empty', () => expect(plannedRows(0, true)).toEqual([]));
});

describe('parseTargetSeconds', () => {
  test.each([
    ['30s', 30], ['30 s', 30], ['45 sec', 45], ['45 seconds', 45], ['1 min', 60], ['2 minutes', 120],
    ['60s each side', 60], ['2x30s', 30], ['2 x 30 s', 30], ['90-120s', 120],
  ])('%s -> %i', (text, s) => expect(parseTargetSeconds(text)).toBe(s));
  test.each([[null], [''], ['2x15'], ['10 reps'], ['20m']])('%s -> null', (text) => {
    expect(parseTargetSeconds(text as any)).toBeNull();
  });
});

describe('previousMatch', () => {
  const history = [prev(1, 'left', { durationS: 40 }), prev(1, 'right', { durationS: 35 }), prev(2, 'left', { durationS: 50 })];
  test('exact set number + side', () => {
    expect(previousMatch({ setNumber: 1, side: 'right' }, history)?.durationS).toBe(35);
  });
  test('falls back to highest set number on the same side', () => {
    expect(previousMatch({ setNumber: 3, side: 'left' }, history)?.durationS).toBe(50);
    expect(previousMatch({ setNumber: 3, side: 'right' }, history)?.durationS).toBe(35);
  });
  test('no same-side rows -> null', () => {
    expect(previousMatch({ setNumber: 1, side: null }, history)).toBeNull();
  });
});

describe('prefillValues', () => {
  test('copies matched values', () => {
    const v = prefillValues({ setNumber: 1, side: null }, [prev(1, null, { reps: 8, weightKg: 40 })], 'weight_reps', null);
    expect(v).toEqual({ ...EMPTY_SET_VALUES, reps: 8, weightKg: 40 });
  });
  test('hold without history uses target text', () => {
    expect(prefillValues({ setNumber: 1, side: 'left' }, [], 'hold', '45s each side').durationS).toBe(45);
  });
  test('hold without history or parseable target defaults to 30', () => {
    expect(prefillValues({ setNumber: 1, side: null }, [], 'hold', '2x15').durationS).toBe(30);
  });
  test('reps without history is blank', () => {
    expect(prefillValues({ setNumber: 1, side: null }, [], 'reps', '2x15')).toEqual(EMPTY_SET_VALUES);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest lib/previousValues.test.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/previousValues.ts
//
// Planned set rows for a newly-added exercise and their prefilled values
// from the most recent saved workout containing the same exercise (spec
// section 4, "Planned sets"). Pure.
import { EMPTY_SET_VALUES, type SetKind, type SetValues, type Side } from './setFields';

export interface PlannedRow {
  readonly setNumber: number;
  readonly side: Side;
}

export interface PreviousSet extends SetValues {
  readonly setNumber: number;
  readonly side: Side;
}

export function plannedRows(setCount: number, sided: boolean): PlannedRow[] {
  const rows: PlannedRow[] = [];
  for (let n = 1; n <= setCount; n++) {
    if (sided) {
      rows.push({ setNumber: n, side: 'left' }, { setNumber: n, side: 'right' });
    } else {
      rows.push({ setNumber: n, side: null });
    }
  }
  return rows;
}

const DEFAULT_HOLD_SECONDS = 30;

/** First "<number> <seconds|minutes unit>" in free text; null if none. */
export function parseTargetSeconds(text: string | null): number | null {
  if (!text) return null;
  const match = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return Math.round(unit.startsWith('m') ? value * 60 : value);
}

export function previousMatch(row: PlannedRow, previous: readonly PreviousSet[]): PreviousSet | null {
  const exact = previous.find((p) => p.setNumber === row.setNumber && p.side === row.side);
  if (exact) return exact;
  const sameSide = previous.filter((p) => p.side === row.side);
  if (sameSide.length === 0) return null;
  return sameSide.reduce((best, p) => (p.setNumber > best.setNumber ? p : best));
}

export function prefillValues(
  row: PlannedRow,
  previous: readonly PreviousSet[],
  kind: SetKind,
  targetText: string | null
): SetValues {
  const match = previousMatch(row, previous);
  if (match) {
    return {
      reps: match.reps,
      weightKg: match.weightKg,
      durationS: match.durationS,
      romValue: match.romValue,
      romUnit: match.romUnit,
    };
  }
  if (kind === 'hold') {
    return { ...EMPTY_SET_VALUES, durationS: parseTargetSeconds(targetText) ?? DEFAULT_HOLD_SECONDS };
  }
  return EMPTY_SET_VALUES;
}
```

Note: `'20m'` must stay null (metres, not minutes) — the regex requires `min`/`minute`, never bare `m`. `'90-120s'` → 120: `90` is followed by `-`, not a unit, so the first match is `120s` (the range's upper bound is a fine default).

- [ ] **Step 4: Run, expect PASS** — `npx jest lib/previousValues.test.ts`.
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/previousValues.* && git commit -m "feat: add planned set rows and previous-value prefill"`

---

### Task 4: Timer state machine (`workoutTimers.ts`)

**Files:**
- Create: `apps/mobile/lib/workoutTimers.ts`
- Test: `apps/mobile/lib/workoutTimers.test.ts`

**Interfaces — Produces:**
```ts
export const LEAD_IN_MS = 3000; export const SWITCH_MS = 5000;
export type HoldTimer =
  | { readonly phase: 'idle' }
  | { readonly phase: 'lead_in'; readonly rowId: string; readonly targetS: number; readonly endsAt: number }
  | { readonly phase: 'holding'; readonly rowId: string; readonly targetS: number; readonly startedAt: number; readonly endsAt: number }
  | { readonly phase: 'switching'; readonly nextRowId: string; readonly nextTargetS: number; readonly endsAt: number };
export type TimerEvent =
  | { readonly type: 'hold_started'; readonly rowId: string }
  | { readonly type: 'hold_completed'; readonly rowId: string; readonly durationS: number }
  | null;
export interface RestTimer { readonly endsAt: number; readonly totalS: number }
export const IDLE: HoldTimer;
export function startHold(rowId: string, targetS: number, now: number): HoldTimer;
export function startSwitch(nextRowId: string, nextTargetS: number, now: number): HoldTimer;
export function tickHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent };
export function stopHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent };
export function holdRemainingS(timer: HoldTimer, now: number): number;
export function startRest(totalS: number, now: number): RestTimer;
export function adjustRest(rest: RestTimer, deltaS: number, now: number): RestTimer | null;
export function restRemainingS(rest: RestTimer, now: number): number;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/workoutTimers.test.ts
import {
  IDLE, startHold, startSwitch, tickHold, stopHold, holdRemainingS,
  startRest, adjustRest, restRemainingS, LEAD_IN_MS, SWITCH_MS,
} from './workoutTimers';

const T0 = 1_000_000;

describe('hold timer', () => {
  test('lead-in then holding then completes with target duration', () => {
    let t = startHold('r1', 30, T0);
    expect(t).toEqual({ phase: 'lead_in', rowId: 'r1', targetS: 30, endsAt: T0 + LEAD_IN_MS });
    expect(tickHold(t, T0 + 1000)).toEqual({ timer: t, event: null });

    const started = tickHold(t, T0 + LEAD_IN_MS);
    expect(started.event).toEqual({ type: 'hold_started', rowId: 'r1' });
    t = started.timer;
    expect(t).toEqual({ phase: 'holding', rowId: 'r1', targetS: 30, startedAt: T0 + LEAD_IN_MS, endsAt: T0 + LEAD_IN_MS + 30000 });

    const done = tickHold(t, T0 + LEAD_IN_MS + 30000);
    expect(done).toEqual({ timer: IDLE, event: { type: 'hold_completed', rowId: 'r1', durationS: 30 } });
  });

  test('a late tick (app backgrounded) still completes, never double-fires', () => {
    const t = tickHold(startHold('r1', 10, T0), T0 + LEAD_IN_MS).timer;
    const done = tickHold(t, T0 + 999999);
    expect(done.event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 10 });
    expect(tickHold(done.timer, T0 + 1000000).event).toBeNull();
  });

  test('a late tick during lead-in jumps straight to completion if the hold also elapsed', () => {
    const r = tickHold(startHold('r1', 10, T0), T0 + LEAD_IN_MS + 10000);
    expect(r.event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 10 });
  });

  test('stop early completes with elapsed seconds, minimum 1', () => {
    const t = tickHold(startHold('r1', 60, T0), T0 + LEAD_IN_MS).timer;
    expect(stopHold(t, T0 + LEAD_IN_MS + 12400)).toEqual({ timer: IDLE, event: { type: 'hold_completed', rowId: 'r1', durationS: 12 } });
    expect(stopHold(t, T0 + LEAD_IN_MS + 100).event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 1 });
  });

  test('stop during lead-in or switching cancels without an event', () => {
    expect(stopHold(startHold('r1', 30, T0), T0 + 500)).toEqual({ timer: IDLE, event: null });
    expect(stopHold(startSwitch('r2', 30, T0), T0 + 500)).toEqual({ timer: IDLE, event: null });
  });

  test('switching auto-starts the next row (no extra lead-in)', () => {
    const s = startSwitch('r2', 45, T0);
    expect(s).toEqual({ phase: 'switching', nextRowId: 'r2', nextTargetS: 45, endsAt: T0 + SWITCH_MS });
    const r = tickHold(s, T0 + SWITCH_MS);
    expect(r.event).toEqual({ type: 'hold_started', rowId: 'r2' });
    expect(r.timer).toEqual({ phase: 'holding', rowId: 'r2', targetS: 45, startedAt: T0 + SWITCH_MS, endsAt: T0 + SWITCH_MS + 45000 });
  });

  test('remaining seconds rounds up; idle is 0', () => {
    expect(holdRemainingS(startHold('r1', 30, T0), T0 + 100)).toBe(3);
    const h = tickHold(startHold('r1', 30, T0), T0 + LEAD_IN_MS).timer;
    expect(holdRemainingS(h, T0 + LEAD_IN_MS + 100)).toBe(30);
    expect(holdRemainingS(IDLE, T0)).toBe(0);
  });
});

describe('rest timer', () => {
  test('start, remaining, adjust', () => {
    const r = startRest(60, T0);
    expect(r).toEqual({ endsAt: T0 + 60000, totalS: 60 });
    expect(restRemainingS(r, T0 + 30500)).toBe(30);
    expect(adjustRest(r, 15, T0)).toEqual({ endsAt: T0 + 75000, totalS: 75 });
  });
  test('adjusting below now ends the rest', () => {
    expect(adjustRest(startRest(10, T0), -15, T0)).toBeNull();
  });
  test('remaining never negative', () => {
    expect(restRemainingS(startRest(10, T0), T0 + 99999)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest lib/workoutTimers.test.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/workoutTimers.ts
//
// Hold / switch-sides / rest timers as a pure state machine. Every deadline
// is an absolute epoch-ms timestamp so a backgrounded app that ticks late
// still lands on the right state (spec section 4, "Timers").
export const LEAD_IN_MS = 3000;
export const SWITCH_MS = 5000;

export type HoldTimer =
  | { readonly phase: 'idle' }
  | { readonly phase: 'lead_in'; readonly rowId: string; readonly targetS: number; readonly endsAt: number }
  | {
      readonly phase: 'holding';
      readonly rowId: string;
      readonly targetS: number;
      readonly startedAt: number;
      readonly endsAt: number;
    }
  | { readonly phase: 'switching'; readonly nextRowId: string; readonly nextTargetS: number; readonly endsAt: number };

export type TimerEvent =
  | { readonly type: 'hold_started'; readonly rowId: string }
  | { readonly type: 'hold_completed'; readonly rowId: string; readonly durationS: number }
  | null;

export interface RestTimer {
  readonly endsAt: number;
  readonly totalS: number;
}

export const IDLE: HoldTimer = { phase: 'idle' };

export function startHold(rowId: string, targetS: number, now: number): HoldTimer {
  return { phase: 'lead_in', rowId, targetS, endsAt: now + LEAD_IN_MS };
}

export function startSwitch(nextRowId: string, nextTargetS: number, now: number): HoldTimer {
  return { phase: 'switching', nextRowId, nextTargetS, endsAt: now + SWITCH_MS };
}

function holding(rowId: string, targetS: number, startedAt: number): HoldTimer {
  return { phase: 'holding', rowId, targetS, startedAt, endsAt: startedAt + targetS * 1000 };
}

export function tickHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent } {
  switch (timer.phase) {
    case 'idle':
      return { timer, event: null };
    case 'lead_in':
    case 'switching': {
      if (now < timer.endsAt) return { timer, event: null };
      const rowId = timer.phase === 'lead_in' ? timer.rowId : timer.nextRowId;
      const targetS = timer.phase === 'lead_in' ? timer.targetS : timer.nextTargetS;
      const next = holding(rowId, targetS, timer.endsAt);
      if (next.phase === 'holding' && now >= next.endsAt) {
        return { timer: IDLE, event: { type: 'hold_completed', rowId, durationS: targetS } };
      }
      return { timer: next, event: { type: 'hold_started', rowId } };
    }
    case 'holding':
      if (now < timer.endsAt) return { timer, event: null };
      return { timer: IDLE, event: { type: 'hold_completed', rowId: timer.rowId, durationS: timer.targetS } };
  }
}

export function stopHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent } {
  if (timer.phase !== 'holding') return { timer: IDLE, event: null };
  const elapsed = Math.floor((now - timer.startedAt) / 1000);
  const durationS = Math.min(timer.targetS, Math.max(1, elapsed));
  return { timer: IDLE, event: { type: 'hold_completed', rowId: timer.rowId, durationS } };
}

export function holdRemainingS(timer: HoldTimer, now: number): number {
  if (timer.phase === 'idle') return 0;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function startRest(totalS: number, now: number): RestTimer {
  return { endsAt: now + totalS * 1000, totalS };
}

export function adjustRest(rest: RestTimer, deltaS: number, now: number): RestTimer | null {
  const endsAt = rest.endsAt + deltaS * 1000;
  if (endsAt <= now) return null;
  return { endsAt, totalS: Math.max(1, rest.totalS + deltaS) };
}

export function restRemainingS(rest: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
}
```

- [ ] **Step 4: Run, expect PASS** — `npx jest lib/workoutTimers.test.ts`.
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/workoutTimers.* && git commit -m "feat: add hold/switch/rest timer state machine"`

---

### Task 5: Formatting, titles, grouping, search, finish plan (pure helpers)

**Files:**
- Create: `apps/mobile/lib/setFormatting.ts`, `apps/mobile/lib/historyGrouping.ts`, `apps/mobile/lib/workoutTitles.ts`, `apps/mobile/lib/exerciseSearch.ts`, `apps/mobile/lib/finishPlan.ts`
- Test: one `*.test.ts` beside each.

**Interfaces:**
- Consumes: `SetKind`, `Side`, `RomUnit`, `SetValues` (Task 2); `WeightUnit`, `formatWeightForDisplay` (`lib/units.ts`).
- Produces:
```ts
// setFormatting.ts
export interface FormattableSet extends SetValues { readonly setNumber: number; readonly side: Side; readonly setType: 'warmup' | 'working' }
export function formatSeconds(s: number): string;                     // 45 -> "45 s", 65 -> "1:05"
export function formatSetValue(set: FormattableSet, kind: SetKind, unit: WeightUnit): string;
export function formatSetLines(sets: readonly FormattableSet[], kind: SetKind, unit: WeightUnit): string[];
// historyGrouping.ts
export function weekStartMonday(d: Date): Date;
export function weekLabel(weekStart: Date, now: Date): string;
export function groupByWeek<T extends { readonly startedAt: string }>(items: readonly T[], now: Date): { label: string; items: T[] }[];
export function durationLabel(startedAt: string, endedAt: string | null): string;
// workoutTitles.ts
export function defaultWorkoutTitle(startedAt: Date): string;
export function sprintWorkoutTitle(painPointName: string, dayNumber: number): string;
export function sprintTargetText(prescribedSets: number | null, text: string | null): string | null;
// exerciseSearch.ts
export interface CatalogExercise { readonly id: string; readonly name: string; readonly exerciseType: string | null; readonly unilateral: boolean; readonly defaultSets: number | null }
export function filterExercises(list: readonly CatalogExercise[], query: string, type: string | null): CatalogExercise[];
// finishPlan.ts
export interface FinishInputExercise { readonly id: string; readonly sprintDayExerciseId: string | null; readonly sets: readonly { readonly id: string; readonly completedAt: string | null }[] }
export type FinishPlan =
  | { readonly ok: false; readonly reason: 'no_completed_sets' }
  | { readonly ok: true; readonly deleteSetIds: string[]; readonly deleteExerciseIds: string[]; readonly sprintDayExerciseIdsToComplete: string[] };
export function planFinish(exercises: readonly FinishInputExercise[]): FinishPlan;
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/lib/setFormatting.test.ts
import { formatSeconds, formatSetValue, formatSetLines, type FormattableSet } from './setFormatting';
import { EMPTY_SET_VALUES } from './setFields';

const s = (v: Partial<FormattableSet>): FormattableSet => ({ ...EMPTY_SET_VALUES, setNumber: 1, side: null, setType: 'working', ...v });

test('formatSeconds', () => {
  expect(formatSeconds(45)).toBe('45 s');
  expect(formatSeconds(60)).toBe('1:00');
  expect(formatSeconds(65)).toBe('1:05');
});

describe('formatSetValue', () => {
  test('weight x reps in kg and lbs', () => {
    expect(formatSetValue(s({ weightKg: 40, reps: 8 }), 'weight_reps', 'kg')).toBe('40 kg × 8');
    expect(formatSetValue(s({ weightKg: 45.359237, reps: 8 }), 'weight_reps', 'lbs')).toBe('100 lbs × 8');
  });
  test('bodyweight weight_reps shows reps only', () => {
    expect(formatSetValue(s({ reps: 10 }), 'weight_reps', 'kg')).toBe('× 10');
  });
  test('reps, hold, duration', () => {
    expect(formatSetValue(s({ reps: 12 }), 'reps', 'kg')).toBe('× 12');
    expect(formatSetValue(s({ durationS: 45 }), 'hold', 'kg')).toBe('45 s');
    expect(formatSetValue(s({ durationS: 750 }), 'duration', 'kg')).toBe('12:30');
  });
  test('ROM suffix and warmup prefix', () => {
    expect(formatSetValue(s({ durationS: 45, romValue: 12, romUnit: 'cm' }), 'hold', 'kg')).toBe('45 s · 12 cm');
    expect(formatSetValue(s({ reps: 5, romValue: 30, romUnit: 'deg' }), 'reps', 'kg')).toBe('× 5 · 30°');
    expect(formatSetValue(s({ reps: 5, setType: 'warmup' }), 'reps', 'kg')).toBe('W × 5');
  });
});

test('formatSetLines pairs sides by set number, left first', () => {
  const lines = formatSetLines(
    [s({ setNumber: 1, side: 'right', durationS: 40 }), s({ setNumber: 1, side: 'left', durationS: 45 }), s({ setNumber: 2, side: 'left', durationS: 50 })],
    'hold',
    'kg'
  );
  expect(lines).toEqual(['L 45 s · R 40 s', 'L 50 s']);
});

test('formatSetLines bilateral keeps set order', () => {
  expect(formatSetLines([s({ setNumber: 2, reps: 6 }), s({ setNumber: 1, reps: 8 })], 'reps', 'kg')).toEqual(['× 8', '× 6']);
});
```

```ts
// apps/mobile/lib/historyGrouping.test.ts
import { weekStartMonday, weekLabel, groupByWeek, durationLabel } from './historyGrouping';

// Local-time constructors on purpose: grouping is in the user's local week.
const now = new Date(2026, 10, 7, 12, 0); // Sat 7 Nov 2026

test('weekStartMonday', () => {
  expect(weekStartMonday(now)).toEqual(new Date(2026, 10, 2));
  expect(weekStartMonday(new Date(2026, 10, 2, 0, 5))).toEqual(new Date(2026, 10, 2));
  expect(weekStartMonday(new Date(2026, 10, 1, 23, 0))).toEqual(new Date(2026, 9, 26)); // Sunday -> previous Monday
});

test('weekLabel', () => {
  expect(weekLabel(new Date(2026, 10, 2), now)).toBe('This week');
  expect(weekLabel(new Date(2026, 9, 26), now)).toBe('Last week');
  expect(weekLabel(new Date(2026, 9, 19), now)).toBe('Week of Mon 19 Oct');
});

test('groupByWeek keeps input order inside groups', () => {
  const items = [
    { id: 'a', startedAt: new Date(2026, 10, 6, 18).toISOString() },
    { id: 'b', startedAt: new Date(2026, 10, 3, 18).toISOString() },
    { id: 'c', startedAt: new Date(2026, 9, 30, 18).toISOString() },
  ];
  expect(groupByWeek(items, now)).toEqual([
    { label: 'This week', items: [items[0], items[1]] },
    { label: 'Last week', items: [items[2]] },
  ]);
});

test('durationLabel', () => {
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T10:42:20Z')).toBe('42 min');
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T11:05:00Z')).toBe('1 h 5 min');
  expect(durationLabel('2026-11-07T10:00:00Z', '2026-11-07T10:00:20Z')).toBe('1 min');
  expect(durationLabel('2026-11-07T10:00:00Z', null)).toBe('');
});
```

```ts
// apps/mobile/lib/workoutTitles.test.ts
import { defaultWorkoutTitle, sprintWorkoutTitle, sprintTargetText } from './workoutTitles';

test('defaultWorkoutTitle by local hour', () => {
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 7))).toBe('Morning workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 12))).toBe('Afternoon workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 16, 59))).toBe('Afternoon workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 17))).toBe('Evening workout');
});
test('sprintWorkoutTitle', () => expect(sprintWorkoutTitle('Ankles', 6)).toBe('Ankles · Day 6'));
test('sprintTargetText', () => {
  expect(sprintTargetText(2, '15 reps')).toBe('2 × 15 reps');
  expect(sprintTargetText(null, '30s each side')).toBe('30s each side');
  expect(sprintTargetText(3, null)).toBe('3 sets');
  expect(sprintTargetText(null, null)).toBeNull();
  expect(sprintTargetText(null, '  ')).toBeNull();
});
```

```ts
// apps/mobile/lib/exerciseSearch.test.ts
import { filterExercises, type CatalogExercise } from './exerciseSearch';

const ex = (id: string, name: string, exerciseType: string | null): CatalogExercise => ({ id, name, exerciseType, unilateral: false, defaultSets: null });
const list = [ex('1', 'Couch Stretch', 'mobility_stretch'), ex('2', 'Nordic Hamstring Curl', 'strength'), ex('3', 'Single-Leg Balance', 'balance')];

test('empty query + no type returns all, sorted by name', () => {
  expect(filterExercises(list, '', null).map((e) => e.id)).toEqual(['1', '2', '3']);
});
test('case-insensitive substring', () => {
  expect(filterExercises(list, 'HAM', null).map((e) => e.id)).toEqual(['2']);
});
test('type filter combines with query', () => {
  expect(filterExercises(list, 'e', 'balance').map((e) => e.id)).toEqual(['3']);
});
test('trims query', () => {
  expect(filterExercises(list, '  couch ', null).map((e) => e.id)).toEqual(['1']);
});
```

```ts
// apps/mobile/lib/finishPlan.test.ts
import { planFinish } from './finishPlan';

test('no completed sets anywhere -> refuse', () => {
  expect(planFinish([{ id: 'e1', sprintDayExerciseId: null, sets: [{ id: 's1', completedAt: null }] }])).toEqual({
    ok: false,
    reason: 'no_completed_sets',
  });
  expect(planFinish([])).toEqual({ ok: false, reason: 'no_completed_sets' });
});

test('deletes uncompleted sets, empty exercises, completes only sprint exercises with work', () => {
  const plan = planFinish([
    { id: 'e1', sprintDayExerciseId: 'sde1', sets: [{ id: 's1', completedAt: 'x' }, { id: 's2', completedAt: null }] },
    { id: 'e2', sprintDayExerciseId: 'sde2', sets: [{ id: 's3', completedAt: null }] },
    { id: 'e3', sprintDayExerciseId: null, sets: [] },
    { id: 'e4', sprintDayExerciseId: null, sets: [{ id: 's4', completedAt: 'x' }] },
  ]);
  expect(plan).toEqual({
    ok: true,
    deleteSetIds: ['s2', 's3'],
    deleteExerciseIds: ['e2', 'e3'],
    sprintDayExerciseIdsToComplete: ['sde1'],
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest lib/setFormatting lib/historyGrouping lib/workoutTitles lib/exerciseSearch lib/finishPlan`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/setFormatting.ts
// Human-readable set lines for the workout detail screen (spec section 6).
import { formatWeightForDisplay, type WeightUnit } from './units';
import type { SetKind, SetValues, Side } from './setFields';

export interface FormattableSet extends SetValues {
  readonly setNumber: number;
  readonly side: Side;
  readonly setType: 'warmup' | 'working';
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

function formatRom(set: SetValues): string {
  if (set.romValue == null) return '';
  const unit = set.romUnit ?? 'cm';
  return unit === 'deg' ? ` · ${set.romValue}°` : ` · ${set.romValue} ${unit}`;
}

function formatCore(set: SetValues, kind: SetKind, unit: WeightUnit): string {
  switch (kind) {
    case 'weight_reps':
      return set.weightKg != null ? `${formatWeightForDisplay(set.weightKg, unit)} ${unit} × ${set.reps ?? 0}` : `× ${set.reps ?? 0}`;
    case 'reps':
      return `× ${set.reps ?? 0}`;
    case 'hold':
    case 'duration':
      return formatSeconds(set.durationS ?? 0);
  }
}

export function formatSetValue(set: FormattableSet, kind: SetKind, unit: WeightUnit): string {
  const prefix = set.setType === 'warmup' ? 'W ' : '';
  return `${prefix}${formatCore(set, kind, unit)}${formatRom(set)}`;
}

export function formatSetLines(sets: readonly FormattableSet[], kind: SetKind, unit: WeightUnit): string[] {
  const numbers = Array.from(new Set(sets.map((x) => x.setNumber))).sort((a, b) => a - b);
  return numbers.map((n) => {
    const group = sets.filter((x) => x.setNumber === n);
    const left = group.find((x) => x.side === 'left');
    const right = group.find((x) => x.side === 'right');
    if (left || right) {
      return [left && `L ${formatSetValue(left, kind, unit)}`, right && `R ${formatSetValue(right, kind, unit)}`]
        .filter(Boolean)
        .join(' · ');
    }
    return formatSetValue(group[0], kind, unit);
  });
}
```

```ts
// apps/mobile/lib/historyGrouping.ts
// Local-time, Monday-start week grouping + duration labels for History.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStartMonday(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7; // Mon=0 ... Sun=6
  start.setDate(start.getDate() - offset);
  return start;
}

export function weekLabel(weekStart: Date, now: Date): string {
  const thisWeek = weekStartMonday(now);
  const diffWeeks = Math.round((thisWeek.getTime() - weekStart.getTime()) / (7 * DAY_MS));
  if (diffWeeks === 0) return 'This week';
  if (diffWeeks === 1) return 'Last week';
  return `Week of Mon ${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]}`;
}

export function groupByWeek<T extends { readonly startedAt: string }>(
  items: readonly T[],
  now: Date
): { label: string; items: T[] }[] {
  const groups: { key: number; label: string; items: T[] }[] = [];
  for (const item of items) {
    const start = weekStartMonday(new Date(item.startedAt));
    const key = start.getTime();
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: weekLabel(start, now), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.map(({ label, items: groupItems }) => ({ label, items: groupItems }));
}

export function durationLabel(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '';
  const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
```
(Note: `weekLabel` uses `Math.round` because DST shifts make a week 167 or 169 hours.)

```ts
// apps/mobile/lib/workoutTitles.ts
export function defaultWorkoutTitle(startedAt: Date): string {
  const h = startedAt.getHours();
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

export function sprintWorkoutTitle(painPointName: string, dayNumber: number): string {
  return `${painPointName} · Day ${dayNumber}`;
}

export function sprintTargetText(prescribedSets: number | null, text: string | null): string | null {
  const trimmed = text?.trim() || null;
  if (prescribedSets && trimmed) return `${prescribedSets} × ${trimmed}`;
  if (trimmed) return trimmed;
  if (prescribedSets) return `${prescribedSets} sets`;
  return null;
}
```

```ts
// apps/mobile/lib/exerciseSearch.ts
export interface CatalogExercise {
  readonly id: string;
  readonly name: string;
  readonly exerciseType: string | null;
  readonly unilateral: boolean;
  readonly defaultSets: number | null;
}

export function filterExercises(list: readonly CatalogExercise[], query: string, type: string | null): CatalogExercise[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((e) => (type ? e.exerciseType === type : true))
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

```ts
// apps/mobile/lib/finishPlan.ts
// Pure "what does Save do" (spec section 4, Finish steps 1-4).
export interface FinishInputExercise {
  readonly id: string;
  readonly sprintDayExerciseId: string | null;
  readonly sets: readonly { readonly id: string; readonly completedAt: string | null }[];
}

export type FinishPlan =
  | { readonly ok: false; readonly reason: 'no_completed_sets' }
  | {
      readonly ok: true;
      readonly deleteSetIds: string[];
      readonly deleteExerciseIds: string[];
      readonly sprintDayExerciseIdsToComplete: string[];
    };

export function planFinish(exercises: readonly FinishInputExercise[]): FinishPlan {
  const deleteSetIds: string[] = [];
  const deleteExerciseIds: string[] = [];
  const sprintDayExerciseIdsToComplete: string[] = [];
  let anyCompleted = false;

  for (const ex of exercises) {
    const done = ex.sets.filter((s) => s.completedAt);
    deleteSetIds.push(...ex.sets.filter((s) => !s.completedAt).map((s) => s.id));
    if (done.length === 0) {
      deleteExerciseIds.push(ex.id);
    } else {
      anyCompleted = true;
      if (ex.sprintDayExerciseId) sprintDayExerciseIdsToComplete.push(ex.sprintDayExerciseId);
    }
  }

  if (!anyCompleted) return { ok: false, reason: 'no_completed_sets' };
  return { ok: true, deleteSetIds, deleteExerciseIds, sprintDayExerciseIdsToComplete };
}
```

- [ ] **Step 4: Run, expect PASS** — same command as Step 2.
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/{setFormatting,historyGrouping,workoutTitles,exerciseSearch,finishPlan}.* && git commit -m "feat: add workout formatting, grouping, search, and finish-plan helpers"`

---

### Task 6: Data layer (`workouts.ts`)

**Files:**
- Create: `apps/mobile/lib/workouts.ts`
- Test: `apps/mobile/lib/workouts.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `completeExercise`, `completeDay`, `submitDayFeedback`, type `SprintDay` from `./sprintLifecycle`; `supabase` from `./supabase`.
- Produces (exact):
```ts
export type WorkoutSource = 'empty' | 'sprint';
export interface WorkoutSetRow extends SetValues { readonly id: string; readonly setNumber: number; readonly side: Side; readonly setType: 'warmup' | 'working'; readonly completedAt: string | null }
export interface WorkoutExerciseRow { readonly id: string; readonly exerciseId: string; readonly exerciseName: string; readonly exerciseType: string | null; readonly unilateral: boolean; readonly position: number; readonly targetText: string | null; readonly measureRom: boolean; readonly sprintDayExerciseId: string | null; readonly sets: readonly WorkoutSetRow[] }
export interface Workout { readonly id: string; readonly title: string; readonly notes: string | null; readonly source: WorkoutSource; readonly sprintDayId: string | null; readonly startedAt: string; readonly endedAt: string | null; readonly exercises: readonly WorkoutExerciseRow[] }
export interface ActiveWorkoutSummary { readonly id: string; readonly title: string; readonly startedAt: string; readonly sprintDayId: string | null }
export interface WorkoutListItem { readonly id: string; readonly title: string; readonly source: WorkoutSource; readonly startedAt: string; readonly endedAt: string | null; readonly exerciseCount: number; readonly setCount: number }
export interface NewWorkoutExercise { readonly exerciseId: string; readonly sprintDayExerciseId: string | null; readonly targetText: string | null; readonly prescribedSets: number | null }
export type StartResult = { readonly ok: true; readonly workoutId: string } | { readonly ok: false; readonly reason: 'in_progress'; readonly activeWorkoutId: string | null };
export interface SetPatch { readonly reps?: number | null; readonly weightKg?: number | null; readonly durationS?: number | null; readonly romValue?: number | null; readonly romUnit?: RomUnit | null; readonly setType?: 'warmup' | 'working'; readonly completedAt?: string | null }
export interface FinishInput { readonly title: string; readonly notes: string; readonly reaction: 'good' | 'neutral' | 'hurt' | null; readonly reactionNote: string }

export function subscribeToActiveWorkoutChanges(cb: () => void): () => void;
export function isInProgressConflict(error: { code?: string } | null): boolean;
export function buildSprintWorkoutExercises(day: SprintDay): NewWorkoutExercise[];
export async function fetchActiveWorkout(): Promise<ActiveWorkoutSummary | null>;
export async function startWorkout(input: { source: WorkoutSource; title: string; sprintDayId?: string | null }): Promise<StartResult>;
export async function addExercisesToWorkout(workoutId: string, specs: readonly NewWorkoutExercise[]): Promise<void>;
export async function startSprintWorkout(day: SprintDay, painPointName: string): Promise<StartResult>;
export async function fetchWorkout(workoutId: string): Promise<Workout>;
export async function updateSet(setId: string, patch: SetPatch): Promise<void>;
export async function addSet(workoutExercise: WorkoutExerciseRow): Promise<void>;
export async function deleteSet(setId: string): Promise<void>;
export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void>;
export async function setMeasureRom(workoutExerciseId: string, on: boolean): Promise<void>;
export async function finishWorkout(workout: Workout, input: FinishInput): Promise<'saved' | 'no_completed_sets'>;
export async function discardWorkout(workoutId: string): Promise<void>;
export async function fetchWorkoutHistory(offset: number, limit: number): Promise<WorkoutListItem[]>;
export async function updateWorkoutMeta(workoutId: string, title: string, notes: string): Promise<void>;
export async function deleteWorkout(workoutId: string): Promise<void>;
export async function fetchExerciseCatalog(): Promise<CatalogExercise[]>;
```

- [ ] **Step 1: Write the failing test** (pure parts + the two riskiest DB paths)

```ts
// apps/mobile/lib/workouts.test.ts
import { isInProgressConflict, buildSprintWorkoutExercises, startWorkout, subscribeToActiveWorkoutChanges } from './workouts';
import type { SprintDay } from './sprintLifecycle';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
import { supabase } from './supabase';

function chain(result: any) {
  const c: any = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'not', 'order', 'range', 'in', 'limit']) c[m] = jest.fn(() => c);
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

beforeEach(() => (supabase.from as jest.Mock).mockReset());

test('isInProgressConflict', () => {
  expect(isInProgressConflict({ code: '23505' })).toBe(true);
  expect(isInProgressConflict({ code: '23503' })).toBe(false);
  expect(isInProgressConflict(null)).toBe(false);
});

test('buildSprintWorkoutExercises keeps order and maps prescriptions', () => {
  const day: SprintDay = {
    id: 'd1', sprintId: 's1', dayNumber: 3, date: '2026-11-07', completedAt: null,
    exercises: [
      { id: 'x2', slotKey: 'b', tier: 2, exerciseId: 'e2', exerciseName: 'B', prescribedSets: null, prescribedRepsOrDuration: '30s each side', order: 2, completedAt: null },
      { id: 'x1', slotKey: 'a', tier: 1, exerciseId: 'e1', exerciseName: 'A', prescribedSets: 2, prescribedRepsOrDuration: '15 reps', order: 1, completedAt: null },
    ],
  };
  expect(buildSprintWorkoutExercises(day)).toEqual([
    { exerciseId: 'e1', sprintDayExerciseId: 'x1', targetText: '2 × 15 reps', prescribedSets: 2 },
    { exerciseId: 'e2', sprintDayExerciseId: 'x2', targetText: '30s each side', prescribedSets: null },
  ]);
});

describe('startWorkout', () => {
  test('success returns id and notifies listeners', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: { id: 'w1' }, error: null }));
    const cb = jest.fn();
    const unsub = subscribeToActiveWorkoutChanges(cb);
    await expect(startWorkout({ source: 'empty', title: 'Evening workout' })).resolves.toEqual({ ok: true, workoutId: 'w1' });
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  test('23505 maps to in_progress with the active id', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chain({ data: null, error: { code: '23505', message: 'dup' } }))
      .mockReturnValueOnce(chain({ data: { id: 'w0', title: 't', started_at: 'x', sprint_day_id: null }, error: null }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).resolves.toEqual({ ok: false, reason: 'in_progress', activeWorkoutId: 'w0' });
  });

  test('other errors throw', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { code: '42501', message: 'denied' } }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).rejects.toThrow('denied');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest lib/workouts.test.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/workouts.ts
//
// Supabase data layer for the logger + history (spec sections 2, 4, 5, 6).
// Decision logic lives in the pure modules it imports; this file only
// reads/writes rows and emits active-workout change events.
import { supabase } from './supabase';
import { completeExercise, completeDay, submitDayFeedback, type SprintDay } from './sprintLifecycle';
import { defaultSetCount, fieldsForExercise, type RomUnit, type SetValues, type Side } from './setFields';
import { plannedRows, prefillValues, type PreviousSet } from './previousValues';
import { planFinish } from './finishPlan';
import { sprintTargetText, sprintWorkoutTitle } from './workoutTitles';
import type { CatalogExercise } from './exerciseSearch';

export type WorkoutSource = 'empty' | 'sprint';

export interface WorkoutSetRow extends SetValues {
  readonly id: string;
  readonly setNumber: number;
  readonly side: Side;
  readonly setType: 'warmup' | 'working';
  readonly completedAt: string | null;
}

export interface WorkoutExerciseRow {
  readonly id: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly exerciseType: string | null;
  readonly unilateral: boolean;
  readonly position: number;
  readonly targetText: string | null;
  readonly measureRom: boolean;
  readonly sprintDayExerciseId: string | null;
  readonly sets: readonly WorkoutSetRow[];
}

export interface Workout {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly source: WorkoutSource;
  readonly sprintDayId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly exercises: readonly WorkoutExerciseRow[];
}

export interface ActiveWorkoutSummary {
  readonly id: string;
  readonly title: string;
  readonly startedAt: string;
  readonly sprintDayId: string | null;
}

export interface WorkoutListItem {
  readonly id: string;
  readonly title: string;
  readonly source: WorkoutSource;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly exerciseCount: number;
  readonly setCount: number;
}

export interface NewWorkoutExercise {
  readonly exerciseId: string;
  readonly sprintDayExerciseId: string | null;
  readonly targetText: string | null;
  readonly prescribedSets: number | null;
}

export type StartResult =
  | { readonly ok: true; readonly workoutId: string }
  | { readonly ok: false; readonly reason: 'in_progress'; readonly activeWorkoutId: string | null };

export interface SetPatch {
  readonly reps?: number | null;
  readonly weightKg?: number | null;
  readonly durationS?: number | null;
  readonly romValue?: number | null;
  readonly romUnit?: RomUnit | null;
  readonly setType?: 'warmup' | 'working';
  readonly completedAt?: string | null;
}

export interface FinishInput {
  readonly title: string;
  readonly notes: string;
  readonly reaction: 'good' | 'neutral' | 'hurt' | null;
  readonly reactionNote: string;
}

// ---- change events -------------------------------------------------------

const listeners = new Set<() => void>();

export function subscribeToActiveWorkoutChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyActiveWorkoutChanged(): void {
  listeners.forEach((cb) => cb());
}

// ---- helpers -------------------------------------------------------------

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function isInProgressConflict(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export function buildSprintWorkoutExercises(day: SprintDay): NewWorkoutExercise[] {
  return [...day.exercises]
    .sort((a, b) => a.order - b.order)
    .map((x) => ({
      exerciseId: x.exerciseId,
      sprintDayExerciseId: x.id,
      targetText: sprintTargetText(x.prescribedSets, x.prescribedRepsOrDuration),
      prescribedSets: x.prescribedSets,
    }));
}

const SET_COLUMNS =
  'id, set_number, side, set_type, reps, weight_kg, duration_s, rom_value, rom_unit, completed_at';

function toSetRow(r: any): WorkoutSetRow {
  return {
    id: r.id,
    setNumber: r.set_number,
    side: r.side,
    setType: r.set_type,
    reps: r.reps,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
    durationS: r.duration_s,
    romValue: r.rom_value == null ? null : Number(r.rom_value),
    romUnit: r.rom_unit,
    completedAt: r.completed_at,
  };
}

function sortSets(sets: WorkoutSetRow[]): WorkoutSetRow[] {
  const sideRank = (s: Side) => (s === 'right' ? 1 : 0);
  return sets.sort((a, b) => a.setNumber - b.setNumber || sideRank(a.side) - sideRank(b.side));
}

// ---- reads ---------------------------------------------------------------

const ACTIVE_COLUMNS = 'id, title, started_at, sprint_day_id';

function toActive(r: any): ActiveWorkoutSummary {
  return { id: r.id, title: r.title, startedAt: r.started_at, sprintDayId: r.sprint_day_id };
}

export async function fetchActiveWorkout(): Promise<ActiveWorkoutSummary | null> {
  const { data, error } = await supabase.from('workouts').select(ACTIVE_COLUMNS).is('ended_at', null).maybeSingle();
  check(error);
  return data ? toActive(data) : null;
}

export async function fetchWorkout(workoutId: string): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      `id, title, notes, source, sprint_day_id, started_at, ended_at,
       workout_exercises ( id, exercise_id, position, target_text, measure_rom, sprint_day_exercise_id,
         exercises!exercise_id ( name, exercise_type, unilateral ),
         workout_sets ( ${SET_COLUMNS} ) )`
    )
    .eq('id', workoutId)
    .single();
  check(error);
  const w: any = data;
  return {
    id: w.id,
    title: w.title,
    notes: w.notes,
    source: w.source,
    sprintDayId: w.sprint_day_id,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    exercises: ((w.workout_exercises ?? []) as any[])
      .map(
        (e): WorkoutExerciseRow => ({
          id: e.id,
          exerciseId: e.exercise_id,
          exerciseName: e.exercises?.name ?? 'Unknown exercise',
          exerciseType: e.exercises?.exercise_type ?? null,
          unilateral: !!e.exercises?.unilateral,
          position: e.position,
          targetText: e.target_text,
          measureRom: e.measure_rom,
          sprintDayExerciseId: e.sprint_day_exercise_id,
          sets: sortSets(((e.workout_sets ?? []) as any[]).map(toSetRow)),
        })
      )
      .sort((a, b) => a.position - b.position),
  };
}

/** Completed sets of this exercise from the most recent *saved* workout. */
async function fetchPreviousSets(exerciseId: string): Promise<PreviousSet[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(`id, workouts!inner ( ended_at ), workout_sets ( ${SET_COLUMNS} )`)
    .eq('exercise_id', exerciseId)
    .not('workouts.ended_at', 'is', null);
  check(error);
  const rows = ((data ?? []) as any[]).filter((r) => r.workouts?.ended_at);
  if (rows.length === 0) return [];
  rows.sort((a, b) => (a.workouts.ended_at < b.workouts.ended_at ? 1 : -1));
  return ((rows[0].workout_sets ?? []) as any[])
    .map(toSetRow)
    .filter((s) => s.completedAt)
    .map((s) => ({
      setNumber: s.setNumber,
      side: s.side,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: s.durationS,
      romValue: s.romValue,
      romUnit: s.romUnit,
    }));
}

export async function fetchExerciseCatalog(): Promise<CatalogExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, exercise_type, unilateral, default_sets')
    .order('name');
  check(error);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    exerciseType: r.exercise_type,
    unilateral: !!r.unilateral,
    defaultSets: r.default_sets,
  }));
}

export async function fetchWorkoutHistory(offset: number, limit: number): Promise<WorkoutListItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, title, source, started_at, ended_at, workout_exercises ( id, workout_sets ( id ) )')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .range(offset, offset + limit - 1);
  check(error);
  return ((data ?? []) as any[]).map((w) => ({
    id: w.id,
    title: w.title,
    source: w.source,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    exerciseCount: (w.workout_exercises ?? []).length,
    setCount: (w.workout_exercises ?? []).reduce((n: number, e: any) => n + (e.workout_sets ?? []).length, 0),
  }));
}

// ---- writes --------------------------------------------------------------

export async function startWorkout(input: {
  source: WorkoutSource;
  title: string;
  sprintDayId?: string | null;
}): Promise<StartResult> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ source: input.source, title: input.title, sprint_day_id: input.sprintDayId ?? null })
    .select('id')
    .single();
  if (isInProgressConflict(error)) {
    const active = await fetchActiveWorkout();
    return { ok: false, reason: 'in_progress', activeWorkoutId: active?.id ?? null };
  }
  check(error);
  notifyActiveWorkoutChanged();
  return { ok: true, workoutId: (data as any).id };
}

export async function addExercisesToWorkout(workoutId: string, specs: readonly NewWorkoutExercise[]): Promise<void> {
  if (specs.length === 0) return;

  const { data: existing, error: posError } = await supabase
    .from('workout_exercises')
    .select('position')
    .eq('workout_id', workoutId);
  check(posError);
  let position = Math.max(0, ...((existing ?? []) as any[]).map((r) => r.position)) + 1;

  const ids = Array.from(new Set(specs.map((s) => s.exerciseId)));
  const { data: meta, error: metaError } = await supabase
    .from('exercises')
    .select('id, exercise_type, unilateral, default_sets')
    .in('id', ids);
  check(metaError);
  const metaById = new Map(((meta ?? []) as any[]).map((m) => [m.id, m]));

  for (const spec of specs) {
    const m = metaById.get(spec.exerciseId);
    const fields = fieldsForExercise({ exerciseType: m?.exercise_type ?? null, unilateral: !!m?.unilateral });
    const previous = await fetchPreviousSets(spec.exerciseId);

    const { data: weRow, error: weError } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workoutId,
        exercise_id: spec.exerciseId,
        sprint_day_exercise_id: spec.sprintDayExerciseId,
        position: position++,
        target_text: spec.targetText,
      })
      .select('id')
      .single();
    check(weError);

    const count = defaultSetCount(fields.kind, spec.prescribedSets, m?.default_sets ?? null);
    const setRows = plannedRows(count, fields.sided).map((row) => {
      const v = prefillValues(row, previous, fields.kind, spec.targetText);
      return {
        workout_exercise_id: (weRow as any).id,
        set_number: row.setNumber,
        side: row.side,
        reps: v.reps,
        weight_kg: v.weightKg,
        duration_s: v.durationS,
        rom_value: v.romValue,
        rom_unit: v.romUnit,
      };
    });
    const { error: setsError } = await supabase.from('workout_sets').insert(setRows);
    check(setsError);
  }
}

export async function startSprintWorkout(day: SprintDay, painPointName: string): Promise<StartResult> {
  const { data: existing, error: existingError } = await supabase
    .from('workouts')
    .select('id')
    .eq('sprint_day_id', day.id)
    .is('ended_at', null)
    .maybeSingle();
  check(existingError);
  if (existing) return { ok: true, workoutId: (existing as any).id };

  const result = await startWorkout({
    source: 'sprint',
    title: sprintWorkoutTitle(painPointName, day.dayNumber),
    sprintDayId: day.id,
  });
  if (!result.ok) return result;

  try {
    await addExercisesToWorkout(result.workoutId, buildSprintWorkoutExercises(day));
  } catch (err) {
    // An empty sprint workout would be a dead end; remove it so a retry starts clean.
    await supabase.from('workouts').delete().eq('id', result.workoutId);
    notifyActiveWorkoutChanged();
    throw err;
  }
  return result;
}

export async function updateSet(setId: string, patch: SetPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if ('reps' in patch) row.reps = patch.reps;
  if ('weightKg' in patch) row.weight_kg = patch.weightKg;
  if ('durationS' in patch) row.duration_s = patch.durationS;
  if ('romValue' in patch) row.rom_value = patch.romValue;
  if ('romUnit' in patch) row.rom_unit = patch.romUnit;
  if ('setType' in patch) row.set_type = patch.setType;
  if ('completedAt' in patch) row.completed_at = patch.completedAt;
  const { error } = await supabase.from('workout_sets').update(row).eq('id', setId);
  check(error);
}

export async function addSet(workoutExercise: WorkoutExerciseRow): Promise<void> {
  const fields = fieldsForExercise({ exerciseType: workoutExercise.exerciseType, unilateral: workoutExercise.unilateral });
  const sets = workoutExercise.sets;
  const nextNumber = Math.max(0, ...sets.map((s) => s.setNumber)) + 1;
  const sides: Side[] = fields.sided ? ['left', 'right'] : [null];
  const rows = sides.map((side) => {
    const last = [...sets].reverse().find((s) => s.side === side);
    return {
      workout_exercise_id: workoutExercise.id,
      set_number: nextNumber,
      side,
      reps: last?.reps ?? null,
      weight_kg: last?.weightKg ?? null,
      duration_s: last?.durationS ?? null,
      rom_value: null,
      rom_unit: last?.romUnit ?? null,
    };
  });
  const { error } = await supabase.from('workout_sets').insert(rows);
  check(error);
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId);
  check(error);
}

export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const { error } = await supabase.from('workout_exercises').delete().eq('id', workoutExerciseId);
  check(error);
}

export async function setMeasureRom(workoutExerciseId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('workout_exercises').update({ measure_rom: on }).eq('id', workoutExerciseId);
  check(error);
}

export async function finishWorkout(workout: Workout, input: FinishInput): Promise<'saved' | 'no_completed_sets'> {
  const plan = planFinish(workout.exercises);
  if (!plan.ok) return 'no_completed_sets';

  if (plan.deleteSetIds.length > 0) {
    const { error } = await supabase.from('workout_sets').delete().in('id', plan.deleteSetIds);
    check(error);
  }
  if (plan.deleteExerciseIds.length > 0) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', plan.deleteExerciseIds);
    check(error);
  }

  if (workout.sprintDayId) {
    for (const id of plan.sprintDayExerciseIdsToComplete) {
      await completeExercise(id);
    }
    const { data: day, error: dayError } = await supabase
      .from('sprint_days')
      .select('id, day_number, sprint_id')
      .eq('id', workout.sprintDayId)
      .single();
    check(dayError);
    await completeDay((day as any).id, (day as any).day_number, (day as any).sprint_id);
    if (input.reaction) {
      await submitDayFeedback((day as any).id, input.reaction, input.reactionNote);
    }
  }

  const { error: endError } = await supabase
    .from('workouts')
    .update({
      title: input.title.trim() || workout.title,
      notes: input.notes.trim() === '' ? null : input.notes.trim(),
      ended_at: new Date().toISOString(),
    })
    .eq('id', workout.id);
  check(endError);
  notifyActiveWorkoutChanged();
  return 'saved';
}

export async function discardWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  check(error);
  notifyActiveWorkoutChanged();
}

export async function updateWorkoutMeta(workoutId: string, title: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({ title: title.trim(), notes: notes.trim() === '' ? null : notes.trim() })
    .eq('id', workoutId);
  check(error);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  check(error);
}
```

Notes for the implementer:
- `finishWorkout` re-run after a partial failure is safe: deletes by id of already-deleted rows affect zero rows; `completeExercise`/`completeDay`/`submitDayFeedback` (an upsert) are idempotent.
- The logger must pass a **freshly fetched** `Workout` to `finishWorkout` (it does — see Task 8).

- [ ] **Step 4: Run, expect PASS** — `npx jest lib/workouts.test.ts` then `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/workouts.* && git commit -m "feat: add workouts data layer"`

---

### Task 7: Live Activity bridge, banner, list row, routes

**Files:**
- Create: `apps/mobile/lib/workoutActivityBridge.ts`, `apps/mobile/components/ActiveWorkoutBanner.tsx`, `apps/mobile/components/WorkoutListRow.tsx`
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/widgets/WorkoutActivity.tsx` (header comment only)
- Create stub screens so routes resolve: `apps/mobile/app/workout/[workoutId].tsx`, `apps/mobile/app/workout-summary/[workoutId].tsx`, `apps/mobile/app/(tabs)/history.tsx` (each: `export default function X() { return null; }` with a one-line comment "replaced in Task 8/9/10").

**Interfaces:**
- Consumes: `ActiveWorkoutSummary`, `fetchActiveWorkout`, `subscribeToActiveWorkoutChanges`, `discardWorkout`, `WorkoutListItem` (Task 6); `durationLabel` (Task 5).
- Produces:
```ts
export function syncWorkoutLiveActivity(active: ActiveWorkoutSummary | null): void;           // workoutActivityBridge.ts
export default function ActiveWorkoutBanner(props: { workout: ActiveWorkoutSummary; onDiscarded: () => void }): JSX.Element;
export default function WorkoutListRow(props: { item: WorkoutListItem; onPress: () => void }): JSX.Element;
```

- [ ] **Step 1: `workoutActivityBridge.ts`** — restore the deleted bridge (it existed at `git show 04d0b3e^:apps/mobile/lib/workoutActivityBridge.ts`), adapted:

```ts
// apps/mobile/lib/workoutActivityBridge.ts
//
// Drives the lock-screen / Dynamic Island Live Activity
// (widgets/WorkoutActivity.tsx) from the in-progress workout. iOS-only and
// never allowed to throw: expo-widgets needs a real native build, so the
// widget module is require()d lazily inside try/catch (keeps Jest and
// non-iOS safe). Restored from the pre-sprint-pivot Logger (commit 04d0b3e^).
import { Platform } from 'react-native';
import type { ActiveWorkoutSummary } from './workouts';

interface WorkoutActivityProps {
  readonly sessionTypeLabel: string;
  readonly startedAtLabel: string;
}
interface LiveActivityInstance {
  end(dismissalPolicy: 'default' | 'immediate', props: WorkoutActivityProps): void;
}
interface LiveActivityFactory {
  start(props: WorkoutActivityProps): LiveActivityInstance;
  getInstances(): readonly LiveActivityInstance[];
}

let currentActivity: LiveActivityInstance | null = null;

function startedAtLabel(startedAt: string): string {
  const time = new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Started at ${time}`;
}

export function syncWorkoutLiveActivity(active: ActiveWorkoutSummary | null): void {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WorkoutActivity: LiveActivityFactory = require('../widgets/WorkoutActivity').default;
    if (active) {
      if (currentActivity) return;
      const existing = WorkoutActivity.getInstances();
      if (existing.length > 0) {
        currentActivity = existing[0];
        return;
      }
      currentActivity = WorkoutActivity.start({
        sessionTypeLabel: active.title,
        startedAtLabel: startedAtLabel(active.startedAt),
      });
    } else {
      // End ours and any orphan left by a previous app process.
      const all = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      all.forEach((a) => a.end('immediate', { sessionTypeLabel: '', startedAtLabel: '' }));
      currentActivity = null;
    }
  } catch (err) {
    console.warn('Live Activity sync failed:', err);
  }
}
```
In `widgets/WorkoutActivity.tsx` change only the header comment's "refreshed only via explicit .start()/.end() calls from sessionLifecycle.ts" to "from lib/workoutActivityBridge.ts". Leave the component and its props as they are.

- [ ] **Step 2: Root layout wiring** — in `apps/mobile/app/_layout.tsx`:
  - import `fetchActiveWorkout`, `subscribeToActiveWorkoutChanges` from `../lib/workouts` and `syncWorkoutLiveActivity` from `../lib/workoutActivityBridge`.
  - add `const refreshLiveActivity = useCallback(() => { fetchActiveWorkout().then(syncWorkoutLiveActivity).catch((err) => console.warn('Active workout fetch failed:', err)); }, []);`
  - in the existing `[session, ...]` effect, after `loadRecommendations();` call `refreshLiveActivity();`; inside the foreground branch call it too; add `const unsubscribeWorkout = subscribeToActiveWorkoutChanges(refreshLiveActivity);` and call `unsubscribeWorkout()` in the cleanup next to `subscription.remove()`. Add `refreshLiveActivity` to the deps array.
  - inside `<Stack.Protected guard={!!session}>` add after the `(tabs)` screen:
```tsx
<Stack.Screen name="workout/[workoutId]" options={{ title: 'Workout', headerBackTitle: 'Back' }} />
<Stack.Screen name="workout-summary/[workoutId]" options={{ title: 'Workout', headerBackTitle: 'Back' }} />
<Stack.Screen name="sprint" options={{ title: 'Sprint', headerBackTitle: 'Back' }} />
```
  - update the header comment: replace the sentence about the banner being removed with one line: "Also keeps the workout Live Activity in sync with the in-progress workout (lib/workoutActivityBridge.ts)."
  - also create stub `apps/mobile/app/sprint.tsx` (`return null`) so the route resolves; Task 9 fills it.

- [ ] **Step 3: Tabs** — `apps/mobile/app/(tabs)/_layout.tsx`:
```tsx
<Tabs>
  <Tabs.Screen name="index" options={{ title: 'Workout' }} />
  <Tabs.Screen name="history" options={{ title: 'History' }} />
  <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
  <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
</Tabs>
```
Update its header comment to "Bottom tab bar: Workout / History / Trends / Settings (see docs/superpowers/specs/2026-11-07-logger-history-design.md section 1)."

- [ ] **Step 4: `ActiveWorkoutBanner.tsx`**

```tsx
// apps/mobile/components/ActiveWorkoutBanner.tsx
//
// In-progress workout banner, rendered at the top of the Workout and
// History tabs' content (spec section 1). Tap resumes; × discards.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import { discardWorkout, type ActiveWorkoutSummary } from '../lib/workouts';

const TICK_MS = 15000;

function elapsedMinutes(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

export default function ActiveWorkoutBanner({
  workout,
  onDiscarded,
}: {
  workout: ActiveWorkoutSummary;
  onDiscarded: () => void;
}) {
  const router = useRouter();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  function handleDiscard() {
    Alert.alert('Discard this workout?', 'Every set logged in it will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardWorkout(workout.id)
            .then(onDiscarded)
            .catch((err: any) => Alert.alert('Error', err?.message ?? 'Could not discard.'));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.tapArea} onPress={() => router.push(`/workout/${workout.id}`)}>
        <View style={styles.dot} />
        <Text style={styles.text} numberOfLines={1}>
          {workout.title} · {elapsedMinutes(workout.startedAt)} min
        </Text>
        <Text style={styles.resume}>Resume</Text>
      </Pressable>
      <Pressable onPress={handleDiscard} hitSlop={8} accessibilityLabel="Discard workout" style={styles.discard}>
        <Text style={styles.discardText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADII.card,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  tapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  text: { ...TYPE.body, color: COLORS.card, fontWeight: '600', flex: 1 },
  resume: { ...TYPE.label, color: COLORS.card },
  discard: { paddingHorizontal: SPACING.xs },
  discardText: { color: COLORS.card, fontWeight: '700', fontSize: 20, lineHeight: 22 },
});
```

- [ ] **Step 5: `WorkoutListRow.tsx`**

```tsx
// apps/mobile/components/WorkoutListRow.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { durationLabel } from '../lib/historyGrouping';
import type { WorkoutListItem } from '../lib/workouts';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WorkoutListRow({ item, onPress }: { item: WorkoutListItem; onPress: () => void }) {
  return (
    <Pressable style={sharedStyles.card} onPress={onPress}>
      <View style={styles.titleRow}>
        <Text style={[TYPE.sectionTitle, styles.title]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.source === 'sprint' && (
          <View style={sharedStyles.chip}>
            <Text style={styles.tag}>Sprint</Text>
          </View>
        )}
      </View>
      <Text style={sharedStyles.helperText}>
        {dateLabel(item.startedAt)} · {durationLabel(item.startedAt, item.endedAt)}
      </Text>
      <Text style={TYPE.body}>
        {item.exerciseCount} {item.exerciseCount === 1 ? 'exercise' : 'exercises'} · {item.setCount}{' '}
        {item.setCount === 1 ? 'set' : 'sets'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { flex: 1 },
  tag: { ...TYPE.helper, color: COLORS.accent, fontWeight: '600' },
});
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (clean) and `npx jest` (all pass).
- [ ] **Step 7: Commit** — `git add -A apps/mobile && git commit -m "feat: add workout routes, tabs, banner, list row, and Live Activity bridge"`

---

### Task 8: Live logger screen + logger components

**Files:**
- Create: `apps/mobile/components/logger/SetRow.tsx`, `ExerciseCard.tsx`, `RestBar.tsx`, `ExercisePickerSheet.tsx`, `FinishSheet.tsx`
- Replace stub: `apps/mobile/app/workout/[workoutId].tsx`

**Interfaces:**
- Consumes: Tasks 2–6 (`fieldsForExercise`, `missingRequiredField`, `defaultRestSeconds`, `SetValues`, `SetKind`, `RomUnit`; `previousMatch` is NOT needed here; timers; `filterExercises`, `CatalogExercise`; all `workouts.ts` functions); `fetchWeightUnit`; `kgToDisplayUnit`/`displayUnitToKg`/`formatWeightForDisplay`; `formatSeconds` from `setFormatting`; `expo-haptics`.
- Produces: component props below (used only inside this task).

```ts
// SetRow
export interface SetRowProps {
  set: WorkoutSetRow; kind: SetKind; measureRom: boolean; unit: WeightUnit;
  draft: SetValues;                                 // current local values
  onChange: (next: SetValues) => void;              // local edit
  onCommitEdit: () => void;                         // blur on a completed row -> persist
  onToggleComplete: () => void;
  onToggleWarmup: () => void;                       // long-press set label
  onDelete: () => void;
  timerLabel: string | null;                        // e.g. "Get ready 3", "0:27", "Switch sides 4"; null when no timer on this row
  onStartHold: (() => void) | null;                 // non-null only for kind==='hold' and not completed
  onStopHold: (() => void) | null;                  // non-null only while this row is holding/lead-in
  hint: string | null;                              // validation hint shown under the row
}
// ExerciseCard
export interface ExerciseCardProps {
  exercise: WorkoutExerciseRow; unit: WeightUnit;
  renderSet: (set: WorkoutSetRow) => React.ReactNode;
  onAddSet: () => void; onToggleRom: () => void; onRemove: () => void;
}
// RestBar
export interface RestBarProps { remainingS: number; onMinus: () => void; onPlus: () => void; onSkip: () => void }
// ExercisePickerSheet
export interface ExercisePickerSheetProps { visible: boolean; catalog: readonly CatalogExercise[]; onPick: (e: CatalogExercise) => void; onClose: () => void }
// FinishSheet
export interface FinishSheetProps {
  visible: boolean; initialTitle: string; isSprint: boolean; saving: boolean;
  onSave: (input: FinishInput) => void; onDiscard: () => void; onClose: () => void;
}
```

Component requirements (implement exactly; use theme tokens):

- **SetRow**: one horizontal row: left label (`set.setType === 'warmup' ? 'W' : String(set.setNumber)` plus `L`/`R` suffix when `set.side`; long-press → `onToggleWarmup`), then inputs by `kind`:
  - `weight_reps`: weight `TextInput` (`keyboardType="decimal-pad"`, shows `formatWeightForDisplay(draft.weightKg, unit)`, parses with `displayUnitToKg(Number(text), unit)`; empty text → `null`) + reps `TextInput` (`number-pad`, integer, empty → null). Unit label after weight.
  - `reps`: reps input only.
  - `hold`: duration seconds input (`number-pad`) + a ▶ / ■ button (▶ when `onStartHold`, ■ when `onStopHold`); when `timerLabel` is non-null show it in place of the input, large and in `COLORS.accent`.
  - `duration`: minutes and seconds inputs (`mm` `ss`), combined into `durationS = m*60 + s`; empty both → null.
  - when `measureRom`: a ROM number input (`decimal-pad`) + a unit toggle cycling `cm → deg → in` (stored in `draft.romUnit`, default `cm` on first edit).
  - right side: a ✓ `Pressable` (filled `COLORS.accent` background when `set.completedAt`, outlined otherwise) → `onToggleComplete`; a small × → `onDelete`.
  - inputs call `onChange` per keystroke and `onCommitEdit` on `onEndEditing` (the screen decides whether to persist).
  - `hint` shown under the row in `sharedStyles.warningText`.
  - completed rows get `COLORS.accentMuted` background.
- **ExerciseCard**: `sharedStyles.card`; header row with `exercise.exerciseName` (`TYPE.sectionTitle`) and a "⋯" `Pressable` that opens `Alert.alert(name, undefined, [{ text: exercise.measureRom ? 'Stop measuring ROM' : 'Measure ROM', onPress: onToggleRom }, { text: 'Remove exercise', style: 'destructive', onPress: () => Alert.alert('Remove exercise?', 'Its sets will be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onRemove }]) }, { text: 'Cancel', style: 'cancel' }])`; `targetText` as `sharedStyles.helperText` "Target: …" when present; then `exercise.sets.map(renderSet)`; then a "+ Add set" text button → `onAddSet`.
- **RestBar**: absolutely positioned bottom bar (`position: 'absolute', left: 0, right: 0, bottom: 0`, `COLORS.ink` background, white text) showing `Rest ${formatSeconds(remainingS)}` and three buttons `−15`, `+15`, `Skip`.
- **ExercisePickerSheet**: `Modal` (`animationType="slide"`, `presentationStyle="pageSheet"`); search `TextInput`; horizontal chip row: `All`, `Mobility` (`mobility_stretch`), `Balance` (`balance`), `Strength` (`strength`), `Plyo` (`plyometric`), `Cardio` (`cardio`); `FlatList` of `filterExercises(catalog, query, type)` rows (name + type label); tap → `onPick(e)` then the screen closes it; "Close" button → `onClose`. Reset query/type when `visible` turns false.
- **FinishSheet**: `Modal` (`pageSheet`). Title `TextInput` (initial `initialTitle`, reset whenever `visible` turns true), notes multiline `TextInput`; if `isSprint`: "How did that feel?" with three toggle chips `Felt good`/`Neutral`/`That hurt` (tap again to unselect → `null`) and an optional note input. Buttons: primary "Save workout" (disabled + "Saving…" when `saving`) → `onSave({ title, notes, reaction, reactionNote })`; text button "Discard workout" in `COLORS.danger` → `onDiscard`; "Keep logging" → `onClose`.

**Screen `app/workout/[workoutId].tsx`** — implement this orchestration exactly:

```tsx
// apps/mobile/app/workout/[workoutId].tsx
//
// Live logger (spec section 4). State: the workout as last fetched from the
// DB, plus local drafts per set id (so typing never round-trips), plus the
// hold and rest timers (pure, from lib/workoutTimers.ts, ticked every 250ms).
// Every DB write is awaited, then the workout is refetched; drafts for ids
// that still exist are kept, new ids are seeded from the row.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  addExercisesToWorkout, addSet, deleteSet, discardWorkout, fetchExerciseCatalog, fetchWorkout,
  finishWorkout, removeWorkoutExercise, setMeasureRom, updateSet,
  type FinishInput, type Workout, type WorkoutExerciseRow, type WorkoutSetRow,
} from '../../lib/workouts';
import { defaultRestSeconds, fieldsForExercise, missingRequiredField, type SetValues } from '../../lib/setFields';
import {
  IDLE, adjustRest, holdRemainingS, restRemainingS, startHold, startRest, startSwitch, stopHold, tickHold,
  type HoldTimer, type RestTimer, type TimerEvent,
} from '../../lib/workoutTimers';
import { formatSeconds } from '../../lib/setFormatting';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';
import type { CatalogExercise } from '../../lib/exerciseSearch';
import SetRow from '../../components/logger/SetRow';
import ExerciseCard from '../../components/logger/ExerciseCard';
import RestBar from '../../components/logger/RestBar';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FinishSheet from '../../components/logger/FinishSheet';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

function valuesOf(s: WorkoutSetRow): SetValues {
  return { reps: s.reps, weightKg: s.weightKg, durationS: s.durationS, romValue: s.romValue, romUnit: s.romUnit };
}

export default function LoggerScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [drafts, setDrafts] = useState<Record<string, SetValues>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<HoldTimer>(IDLE);
  const [rest, setRest] = useState<RestTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Refs so timer callbacks (created in an older render) read current state.
  const workoutRef = useRef<Workout | null>(null);
  workoutRef.current = workout;
  const draftsRef = useRef<Record<string, SetValues>>({});
  draftsRef.current = drafts;

  const reload = useCallback(async () => {
    const w = await fetchWorkout(workoutId);
    setWorkout(w);
    setDrafts((prev) => {
      const next: Record<string, SetValues> = {};
      for (const e of w.exercises) for (const s of e.sets) next[s.id] = prev[s.id] ?? valuesOf(s);
      return next;
    });
    return w;
  }, [workoutId]);

  useEffect(() => {
    (async () => {
      try {
        const [, u] = await Promise.all([reload(), fetchWeightUnit().catch(() => 'lbs' as WeightUnit)]);
        setUnit(u);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this workout.');
      }
    })();
  }, [reload]);

  // ---- lookups ----
  function findSet(w: Workout, setId: string): { exercise: WorkoutExerciseRow; set: WorkoutSetRow } | null {
    for (const exercise of w.exercises) {
      const set = exercise.sets.find((s) => s.id === setId);
      if (set) return { exercise, set };
    }
    return null;
  }
  function kindOf(e: WorkoutExerciseRow) {
    return fieldsForExercise({ exerciseType: e.exerciseType, unilateral: e.unilateral }).kind;
  }
  /** The Right row with the same set number, if setId is an incomplete-partner Left row. */
  function rightPartner(e: WorkoutExerciseRow, s: WorkoutSetRow): WorkoutSetRow | null {
    if (s.side !== 'left') return null;
    return e.sets.find((x) => x.setNumber === s.setNumber && x.side === 'right' && !x.completedAt) ?? null;
  }

  // ---- completing ----
  async function completeRow(setId: string, overrideDurationS?: number, viaTimer = false) {
    const w = workoutRef.current;
    if (!w) return;
    const found = findSet(w, setId);
    if (!found) return;
    const kind = kindOf(found.exercise);
    const values = { ...(draftsRef.current[setId] ?? valuesOf(found.set)), ...(overrideDurationS != null ? { durationS: overrideDurationS } : {}) };
    const missing = missingRequiredField(kind, values);
    if (missing) {
      setHints((h) => ({ ...h, [setId]: missing }));
      return;
    }
    setHints((h) => {
      const { [setId]: _, ...rest } = h;
      return rest;
    });
    try {
      await updateSet(setId, { ...values, completedAt: new Date().toISOString() });
      setDrafts((d) => ({ ...d, [setId]: values }));
      const fresh = await reload();
      const again = findSet(fresh, setId);
      const partner = again ? rightPartner(again.exercise, again.set) : null;
      if (partner && viaTimer && kind === 'hold') {
        setRest(null);
        setHold(startSwitch(partner.id, (draftsRef.current[partner.id] ?? valuesOf(partner)).durationS ?? 30, Date.now()));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else if (!partner) {
        setRest(startRest(defaultRestSeconds(kind), Date.now()));
      }
    } catch (err) {
      reportError(err, 'Could not save that set.');
    }
  }

  async function uncompleteRow(setId: string) {
    try {
      await updateSet(setId, { completedAt: null });
      await reload();
    } catch (err) {
      reportError(err, 'Could not update that set.');
    }
  }

  async function commitEdit(setId: string) {
    const w = workoutRef.current;
    const found = w && findSet(w, setId);
    if (!found || !found.set.completedAt) return; // incomplete rows persist on ✓
    try {
      await updateSet(setId, draftsRef.current[setId]);
      await reload();
    } catch (err) {
      reportError(err, 'Could not save that edit.');
    }
  }

  // ---- timers ----
  function handleTimerEvent(event: TimerEvent) {
    if (!event) return;
    if (event.type === 'hold_completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      completeRow(event.rowId, event.durationS, true);
    }
  }

  const timerActive = hold.phase !== 'idle' || rest !== null;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setHold((prev) => {
        const { timer, event } = tickHold(prev, t);
        if (event) setTimeout(() => handleTimerEvent(event), 0);
        return timer;
      });
      setRest((prev) => {
        if (prev && restRemainingS(prev, t) === 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return null;
        }
        return prev;
      });
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  function startHoldFor(set: WorkoutSetRow) {
    const t = Date.now();
    // Starting a new hold finishes any running one with its elapsed time.
    const stopped = stopHold(hold, t);
    if (stopped.event) handleTimerEvent(stopped.event);
    setRest(null);
    const target = (drafts[set.id] ?? valuesOf(set)).durationS ?? 30;
    setHold(startHold(set.id, target, t));
    setNow(t);
  }

  function stopHoldNow() {
    const { timer, event } = stopHold(hold, Date.now());
    setHold(timer);
    // Manual stop: complete with elapsed time but do NOT auto-switch sides.
    if (event && event.type === 'hold_completed') completeRow(event.rowId, event.durationS, false);
  }

  function timerLabelFor(setId: string): string | null {
    if (hold.phase === 'lead_in' && hold.rowId === setId) return `Get ready ${holdRemainingS(hold, now)}`;
    if (hold.phase === 'holding' && hold.rowId === setId) return formatSeconds(holdRemainingS(hold, now));
    if (hold.phase === 'switching' && hold.nextRowId === setId) return `Switch sides ${holdRemainingS(hold, now)}`;
    return null;
  }

  // ---- structure edits ----
  async function run(action: () => Promise<unknown>, fallback: string) {
    try {
      await action();
      await reload();
    } catch (err) {
      reportError(err, fallback);
    }
  }

  async function openPicker() {
    setPickerOpen(true);
    if (catalog.length === 0) {
      try {
        setCatalog(await fetchExerciseCatalog());
      } catch (err) {
        reportError(err, 'Could not load exercises.');
      }
    }
  }

  async function pickExercise(e: CatalogExercise) {
    setPickerOpen(false);
    await run(
      () => addExercisesToWorkout(workoutId, [{ exerciseId: e.id, sprintDayExerciseId: null, targetText: null, prescribedSets: null }]),
      'Could not add that exercise.'
    );
  }

  // ---- finish / discard ----
  async function handleSave(input: FinishInput) {
    setSaving(true);
    try {
      setHold(IDLE);
      setRest(null);
      const fresh = await reload();
      const result = await finishWorkout(fresh, input);
      if (result === 'no_completed_sets') {
        Alert.alert('No sets completed', 'Tick at least one set, or discard this workout.', [
          { text: 'Keep logging', style: 'cancel', onPress: () => setFinishOpen(false) },
          { text: 'Discard', style: 'destructive', onPress: handleDiscardConfirmed },
        ]);
        return;
      }
      setFinishOpen(false);
      router.replace(`/workout-summary/${workoutId}`);
    } catch (err) {
      reportError(err, 'Could not save this workout. Your sets are still here — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscardConfirmed() {
    try {
      await discardWorkout(workoutId);
      setFinishOpen(false);
      router.back();
    } catch (err) {
      reportError(err, 'Could not discard this workout.');
    }
  }

  function handleDiscard() {
    Alert.alert('Discard this workout?', 'Every set logged in it will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: handleDiscardConfirmed },
    ]);
  }

  // ---- render ----
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={() => reload().then(() => setLoadError(null)).catch((e) => setLoadError(e?.message ?? 'Could not load.'))}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!workout) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (workout.endedAt) {
    // Opened a saved workout via a stale link -- show it read-only instead.
    router.replace(`/workout-summary/${workout.id}`);
    return null;
  }

  return (
    <View style={sharedStyles.screen}>
      <Stack.Screen
        options={{
          title: workout.title,
          headerRight: () => (
            <Pressable onPress={() => setFinishOpen(true)} hitSlop={8}>
              <Text style={styles.finish}>Finish</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[sharedStyles.screenContent, styles.bottomPad]} keyboardShouldPersistTaps="handled">
        {workout.exercises.length === 0 && (
          <Text style={sharedStyles.helperText}>No exercises yet — add one below.</Text>
        )}
        {workout.exercises.map((exercise) => {
          const kind = kindOf(exercise);
          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              unit={unit}
              onAddSet={() => run(() => addSet(exercise), 'Could not add a set.')}
              onToggleRom={() => run(() => setMeasureRom(exercise.id, !exercise.measureRom), 'Could not update.')}
              onRemove={() => run(() => removeWorkoutExercise(exercise.id), 'Could not remove that exercise.')}
              renderSet={(set) => {
                const isTimerRow =
                  (hold.phase === 'lead_in' || hold.phase === 'holding') && hold.rowId === set.id;
                return (
                  <SetRow
                    key={set.id}
                    set={set}
                    kind={kind}
                    measureRom={exercise.measureRom}
                    unit={unit}
                    draft={drafts[set.id] ?? valuesOf(set)}
                    onChange={(next) => setDrafts((d) => ({ ...d, [set.id]: next }))}
                    onCommitEdit={() => commitEdit(set.id)}
                    onToggleComplete={() => (set.completedAt ? uncompleteRow(set.id) : completeRow(set.id))}
                    onToggleWarmup={() =>
                      run(() => updateSet(set.id, { setType: set.setType === 'warmup' ? 'working' : 'warmup' }), 'Could not update.')
                    }
                    onDelete={() => run(() => deleteSet(set.id), 'Could not delete that set.')}
                    timerLabel={timerLabelFor(set.id)}
                    onStartHold={kind === 'hold' && !set.completedAt && !isTimerRow ? () => startHoldFor(set) : null}
                    onStopHold={isTimerRow ? stopHoldNow : null}
                    hint={hints[set.id] ?? null}
                  />
                );
              }}
            />
          );
        })}
        <Pressable style={sharedStyles.primaryButton} onPress={openPicker}>
          <Text style={sharedStyles.primaryButtonText}>+ Add exercise</Text>
        </Pressable>
      </ScrollView>
      {rest && (
        <RestBar
          remainingS={restRemainingS(rest, now)}
          onMinus={() => setRest((r) => (r ? adjustRest(r, -15, Date.now()) : r))}
          onPlus={() => setRest((r) => (r ? adjustRest(r, 15, Date.now()) : r))}
          onSkip={() => setRest(null)}
        />
      )}
      <ExercisePickerSheet visible={pickerOpen} catalog={catalog} onPick={pickExercise} onClose={() => setPickerOpen(false)} />
      <FinishSheet
        visible={finishOpen}
        initialTitle={workout.title}
        isSprint={workout.source === 'sprint'}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onClose={() => setFinishOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  finish: { ...TYPE.label, color: COLORS.accent, fontWeight: '700' },
  bottomPad: { paddingBottom: 120 },
});
```

Implementer notes:
- `router.replace` during render for `endedAt` must be moved into a `useEffect` keyed on `workout?.endedAt` if React warns about updates during render — do that (render `null` meanwhile).
- `handleTimerEvent` is called via `setTimeout(…, 0)` from inside the `setHold` updater so side effects never run inside a state updater.
- Verify the Haptics API names against Expo SDK 56 docs (`impactAsync`, `notificationAsync`, `ImpactFeedbackStyle`, `NotificationFeedbackType`).

- [ ] **Step 1:** Implement the five components per the requirements above.
- [ ] **Step 2:** Implement the screen as above.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx jest` all pass.
- [ ] **Step 4: Commit** — `git add -A apps/mobile && git commit -m "feat: add live workout logger screen"`

---

### Task 9: Workout tab + sprint flow moved behind `/sprint`

**Files:**
- Create (replace stub): `apps/mobile/app/sprint.tsx`
- Rewrite: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/components/SprintDayChecklist.tsx`
- Create: `apps/mobile/components/SprintCard.tsx`
- Delete: `apps/mobile/components/DayFeedbackSheet.tsx` (feedback now lives in FinishSheet)

**Interfaces:**
- Consumes: `startWorkout`, `startSprintWorkout`, `fetchActiveWorkout`, `fetchWorkoutHistory`, `subscribeToActiveWorkoutChanges`, `ActiveWorkoutSummary`, `WorkoutListItem`, `StartResult` (Task 6); `ActiveWorkoutBanner`, `WorkoutListRow` (Task 7); `defaultWorkoutTitle` (Task 5); `fetchPainPoints`, `fetchInFlightSprint`, `fetchTodaySprintDay`, `Sprint`, `SprintDay`, `PainPoint` (existing `sprintLifecycle.ts`).
- Produces:
```ts
// lib/workoutStart.ts (new, tiny, shared by Workout tab + sprint screen)
export function handleStartResult(result: StartResult, router: { push: (href: string) => void }): void;
// SprintCard
export default function SprintCard(props: {
  sprint: Sprint | null; painPointName: string | null; today: SprintDay | null;
  activeWorkout: ActiveWorkoutSummary | null; starting: boolean;
  onStartRoutine: () => void; onOpenSprint: () => void;
}): JSX.Element;
```

- [ ] **Step 1: `lib/workoutStart.ts`**

```ts
// apps/mobile/lib/workoutStart.ts
// Shared handling of startWorkout/startSprintWorkout results: navigate on
// success; on an in-progress conflict, offer to resume the other workout.
import { Alert } from 'react-native';
import type { StartResult } from './workouts';

export function handleStartResult(result: StartResult, router: { push: (href: string) => void }): void {
  if (result.ok) {
    router.push(`/workout/${result.workoutId}`);
    return;
  }
  const activeId = result.activeWorkoutId;
  Alert.alert('You already have a workout in progress', 'Finish or discard it before starting another.', [
    { text: 'Cancel', style: 'cancel' },
    ...(activeId ? [{ text: 'Resume', onPress: () => router.push(`/workout/${activeId}`) }] : []),
  ]);
}
```

- [ ] **Step 2: `SprintDayChecklist.tsx` changes** — props become:
```ts
{
  day: SprintDay;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onStartRoutine: () => void;
  onAbandon: () => void;
  starting: boolean;
  routineInProgress: boolean;
  dayComplete?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
}
```
Remove `onToggleExercise`, `onCompleteDay`, `completingDay`. Each exercise row shows `{exercise.completedAt ? '✓ ' : ''}{exercise.exerciseName}` as plain `Text` (no `Pressable`), prescription line unchanged, Swap link unchanged (still hidden when completed or day complete). Replace the bottom "Complete Day" button with (only when `!dayComplete`):
```tsx
<Pressable style={sharedStyles.primaryButton} disabled={starting} onPress={onStartRoutine}>
  <Text style={sharedStyles.primaryButtonText}>
    {starting ? 'Starting…' : routineInProgress ? "Resume today's routine" : "Start today's routine"}
  </Text>
</Pressable>
```
Remove the now-unused `checkRow` style.

- [ ] **Step 3: `app/sprint.tsx`** — move the full current contents of `app/(tabs)/index.tsx` here (rename component `SprintScreen`), then:
  - Update import paths from `../../lib/...`/`../../components/...` to `../lib/...`/`../components/...`.
  - Delete `handleToggleExercise`, `handleCompleteDayPress`, `handleSubmitFeedback`, the `completingDay`, `feedbackOpen`, `pendingCompleteDay` state, the `DayFeedbackSheet` import + element, and the `completeExercise`, `completeDay`, `submitDayFeedback` imports.
  - Add state `const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutSummary | null>(null);` and `const [starting, setStarting] = useState(false);`; in `load()` fetch `fetchActiveWorkout()` alongside the existing `Promise.all` and set it.
  - Reload on focus: `useFocusEffect(useCallback(() => { load('refresh'); }, [load]));` (import `useFocusEffect` and `useRouter` from `expo-router`). Keep the existing initial `useEffect(load)`.
  - **Fix the parked pull-to-refresh bug:** in `load`, when `mode === 'refresh'` a failure must call `reportError(err, 'Could not refresh.')` instead of `setLoadError(...)`.
  - Add:
```ts
async function handleStartRoutine() {
  if (!today || !sprint) return;
  const painPointName = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
  setStarting(true);
  try {
    handleStartResult(await startSprintWorkout(today, painPointName), router);
  } catch (err: any) {
    reportError(err, "Could not start today's routine.");
  } finally {
    setStarting(false);
  }
}
```
  - Pass to `SprintDayChecklist`: `onStartRoutine={handleStartRoutine}`, `starting={starting}`, `routineInProgress={!!activeWorkout && activeWorkout.sprintDayId === today.id}`.
  - In `handleSubmitReassessment`/`AssessmentSummary`'s `onDone`, keep behavior; on `onDone` additionally `router.back()` is NOT needed (stay on screen showing the picker).
  - Header comment: "Sprint flow (moved from the Home tab on 2026-11-07, see docs/superpowers/specs/2026-11-07-logger-history-design.md section 5). Day completion now happens by saving the day's workout in the logger."

- [ ] **Step 4: `SprintCard.tsx`** — `sharedStyles.card` with, per spec section 1 bullet 2:
  - `sprint == null`: title "Fix a pain point", helper "Pick one pain point and run a 14-day routine.", primary button "Choose a pain point" → `onOpenSprint`.
  - `pending_baseline`: title `${painPointName}`, helper "Baseline assessment due", primary "Take baseline" → `onOpenSprint`.
  - `pending_reassessment`: helper "Reassessment due", primary "Reassess" → `onOpenSprint`.
  - `active` and `today` and `!today.completedAt`: title `${painPointName} · Day ${today.dayNumber} of 14`, helper `${today.exercises.length} exercises`, primary `starting ? 'Starting…' : activeWorkout?.sprintDayId === today.id ? "Resume today's routine" : "Start today's routine"` → `onStartRoutine` (disabled while `starting`), text link "View sprint" → `onOpenSprint`.
  - `active` and `today?.completedAt`: title `${painPointName} · Day ${today.dayNumber} logged ✓`, link "View sprint".
  - `active` and `!today`: helper "No routine scheduled today", link "View sprint".

- [ ] **Step 5: Workout tab `app/(tabs)/index.tsx`** — full rewrite:

```tsx
// apps/mobile/app/(tabs)/index.tsx
//
// Workout tab (spec section 1): in-progress banner or "Start empty
// workout", the sprint card, and the 3 most recent saved workouts.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, fetchWorkoutHistory, startSprintWorkout, startWorkout, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary, type WorkoutListItem,
} from '../../lib/workouts';
import { fetchInFlightSprint, fetchPainPoints, fetchTodaySprintDay, type PainPoint, type Sprint, type SprintDay } from '../../lib/sprintLifecycle';
import { defaultWorkoutTitle } from '../../lib/workoutTitles';
import { handleStartResult } from '../../lib/workoutStart';
import ActiveWorkoutBanner from '../../components/ActiveWorkoutBanner';
import WorkoutListRow from '../../components/WorkoutListRow';
import SprintCard from '../../components/SprintCard';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function WorkoutTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveWorkoutSummary | null>(null);
  const [recent, setRecent] = useState<WorkoutListItem[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [a, r, s, pp] = await Promise.all([fetchActiveWorkout(), fetchWorkoutHistory(0, 3), fetchInFlightSprint(), fetchPainPoints()]);
      setActive(a);
      setRecent(r);
      setSprint(s);
      setPainPoints(pp);
      setToday(s && s.status === 'active' ? await fetchTodaySprintDay(s.id) : null);
      setLoadError(null);
    } catch (err: any) {
      if (mode === 'initial') setLoadError(err?.message ?? 'Failed to load.');
      else reportError(err, 'Could not refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load('refresh');
    }, [load])
  );
  useEffect(() => subscribeToActiveWorkoutChanges(() => load('refresh')), [load]);

  async function handleStartEmpty() {
    setStarting(true);
    try {
      handleStartResult(await startWorkout({ source: 'empty', title: defaultWorkoutTitle(new Date()) }), router);
    } catch (err) {
      reportError(err, 'Could not start a workout.');
    } finally {
      setStarting(false);
    }
  }

  async function handleStartRoutine() {
    if (!today || !sprint) return;
    const name = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
    setStarting(true);
    try {
      handleStartResult(await startSprintWorkout(today, name), router);
    } catch (err) {
      reportError(err, "Could not start today's routine.");
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={() => { setLoading(true); load('initial'); }}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const painPointName = sprint ? painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? null : null;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
    >
      {active ? (
        <ActiveWorkoutBanner workout={active} onDiscarded={() => load('refresh')} />
      ) : (
        <Pressable style={sharedStyles.primaryButton} disabled={starting} onPress={handleStartEmpty}>
          <Text style={sharedStyles.primaryButtonText}>{starting ? 'Starting…' : 'Start empty workout'}</Text>
        </Pressable>
      )}
      <SprintCard
        sprint={sprint}
        painPointName={painPointName}
        today={today}
        activeWorkout={active}
        starting={starting}
        onStartRoutine={handleStartRoutine}
        onOpenSprint={() => router.push('/sprint')}
      />
      <View style={styles.sectionHeader}>
        <Text style={TYPE.sectionTitle}>Recent</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push('/history')}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        )}
      </View>
      {recent.length === 0 ? (
        <Text style={sharedStyles.helperText}>No workouts yet. Start one above.</Text>
      ) : (
        recent.map((item) => <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
});
```
(`useFocusEffect` also fires on first mount; the duplicate first load is harmless. If it causes a visible double spinner, drop the separate `useEffect(load('initial'))` and let focus do the initial load with `mode` = `loading ? 'initial' : 'refresh'` — keep `loading` true initially either way.)

- [ ] **Step 6: Delete `components/DayFeedbackSheet.tsx`** and grep that nothing imports it: `grep -rn DayFeedbackSheet apps/mobile/app apps/mobile/components apps/mobile/lib` → no matches.
- [ ] **Step 7: Verify** — `npx tsc --noEmit` clean; `npx jest` all pass.
- [ ] **Step 8: Commit** — `git add -A apps/mobile && git commit -m "feat: rebuild Workout tab and route sprint days through the logger"`

---

### Task 10: History tab + workout detail

**Files:**
- Replace stubs: `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/workout-summary/[workoutId].tsx`

**Interfaces:** Consumes `fetchWorkoutHistory`, `fetchWorkout`, `updateWorkoutMeta`, `deleteWorkout`, `fetchActiveWorkout`, `subscribeToActiveWorkoutChanges` (Task 6); `groupByWeek`, `durationLabel` (Task 5); `formatSetLines` (Task 5); `fieldsForExercise` (Task 2); `fetchWeightUnit`; `WorkoutListRow`, `ActiveWorkoutBanner` (Task 7).

- [ ] **Step 1: History tab** — `ScrollView` with `RefreshControl`; state: `items: WorkoutListItem[]`, `hasMore`, `loadingMore`, `active`. Page size `30`. Load on mount and on focus (`useFocusEffect`) as page 0 (replace list); "Load more" button at the end when `hasMore` (`hasMore = page.length === 30`) appends `fetchWorkoutHistory(items.length, 30)`. Render `ActiveWorkoutBanner` first if `active`. Render `groupByWeek(items, new Date())` as `TYPE.sectionTitle` headers each followed by `WorkoutListRow`s → `router.push('/workout-summary/' + id)`. Empty state text exactly: "No workouts yet — start one from the Workout tab." Initial-load failure → full-screen error + "Try again"; refresh / load-more failure → `Alert` only (list stays).

- [ ] **Step 2: Detail screen** — `useLocalSearchParams<{ workoutId: string }>()`; load `fetchWorkout` + `fetchWeightUnit()` (fallback `'lbs'`). Render:
  - `Stack.Screen options={{ title: workout.title, headerRight: Edit }}`.
  - Header card: date (`toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })`), `durationLabel(startedAt, endedAt)`, "Sprint" chip when `source === 'sprint'`, notes if present.
  - One card per exercise: name, then each line of `formatSetLines(exercise.sets, fieldsForExercise({ exerciseType, unilateral }).kind, unit)` as `TYPE.body` prefixed with `Set N  ` where N is the line index + 1.
  - Edit mode (toggled by header "Edit"): title + notes `TextInput`s, "Save" → `updateWorkoutMeta` then refetch and leave edit mode (failure → `Alert`, stay in edit mode with input intact), "Cancel".
  - Bottom "Delete workout" text button (`COLORS.danger`) → confirm Alert → `deleteWorkout` → `router.back()`.
  - If the fetched workout has `endedAt == null` (in progress), `router.replace('/workout/' + id)` from a `useEffect`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx jest` all pass.
- [ ] **Step 4: Commit** — `git add -A apps/mobile && git commit -m "feat: add History tab and workout detail screen"`

---

### Task 11: Integration verification, docs, ship (orchestrator)

- [ ] **Step 1:** Whole-branch review (one reviewer subagent, opus) against the spec — cross-task integration bugs (timer→complete→switch chain, finish ordering, sprint day completion, stale drafts, focus reloads).
- [ ] **Step 2:** Fix findings; re-run `npx jest`, `npx tsc --noEmit`, `npx expo export --platform ios` (from `apps/mobile`).
- [ ] **Step 3:** Update root `CLAUDE.md` Status with a dated 2026-11-07 entry (what shipped, what's unverified) and the build log if present; commit.
- [ ] **Step 4:** Merge `feat/logger-history` → `master` (fast-forward), `git push`.
- [ ] **Step 5:** `cd apps/mobile && eas build --platform ios --profile production --non-interactive` then `eas submit --platform ios --latest --non-interactive`.
- [ ] **Step 6:** Report to Sohan with an on-device walkthrough checklist.
