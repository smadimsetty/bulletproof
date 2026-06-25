# Settings screen + HealthKit expansion (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 3 Settings stub
(`apps/mobile/app/(tabs)/settings.tsx`) with a real form covering preferred
split, activities, pains, goals, training frequency, diet, weight/birth
date, location, and HealthKit — per
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Phase 4 —
Settings" subsection and the fuller detail in
`docs/superpowers/specs/2026-06-24-settings-healthkit-design.md`. Expand
`apps/mobile/lib/healthkitSync.ts`'s `READ_PERMISSIONS` to add sleep
analysis and heart-rate types, and actually query the three quantity types
already requested but unused, persisting calories/steps into `activity`'s
existing null columns.

**Architecture:** `settings.tsx` is the screen-level data/state container
(loads `user_profile` + 4 taxonomy tables in parallel, owns local form
state, issues all Supabase writes). It delegates repeated UI patterns to
three new components under a new `apps/mobile/components/` directory
(`DropdownAddSection`, `PainEntryRow`, `HealthKitSection`). A new
`apps/mobile/lib/theme.ts` centralizes the calm/minimal Oura-inspired style
constants every section uses. `healthkitMapping.ts` gains pure
day-bucketing/summing functions for the new quantity/category samples;
`healthkitSync.ts` gains a second exported function,
`syncHealthKitDailyMetrics()`, called alongside the existing
`syncHealthKitWorkouts()` from the same `app/_layout.tsx` effect.

**Tech Stack:** Expo SDK ~56, Expo Router, React Native 0.85, TypeScript
(strict mode), Jest (existing `lib/*.test.ts` suite, extended not
replaced), `@kingstinct/react-native-healthkit@^14.0.2` (existing
dependency, new functions/identifiers used), `expo-location` (new
dependency, installed via `npx expo install`).

## Global Constraints

- **No new Supabase migration.** Every column/table this plan reads or
  writes already exists and is already RLS-protected
  (`supabase/migrations/20260623142000_expand_user_profile.sql` and the
  four taxonomy migrations). Do not write any `.sql` file in this plan.
- **Every new npm package is installed via `npx expo install <pkg>`**, not
  hand-typed into `package.json` — the only new package this plan adds is
  `expo-location` (Task 7). Accept whatever version `expo install` resolves.
- **No new native HealthKit dependency.** `@kingstinct/react-native-
  healthkit` is already installed; this plan only imports additional
  already-published functions/identifiers from it (`queryQuantitySamples`,
  `queryCategorySamples`, `HKCategoryTypeIdentifierSleepAnalysis`,
  `HKQuantityTypeIdentifierHeartRate`,
  `HKQuantityTypeIdentifierRestingHeartRate`) — confirmed against the
  actual published v14.0.2 source (design spec Decision 1), not assumed
  from training data.
- **No new RN component-render test framework.** Verification bar for
  every task: `npx tsc --noEmit` from `apps/mobile/` (clean compile) plus
  `npm test --prefix apps/mobile` (Jest — existing suite stays green, new
  pure-logic tests added where this plan adds pure functions). UI/screen
  components get no automated test — manual verification only, same as the
  mobile-nav phase's precedent.
- **Severity control is a stepped row of 10 tappable buttons**, not
  `@react-native-community/slider` — no new native dependency for it
  (design spec Decision 5).
- **Visual styling uses `apps/mobile/lib/theme.ts`'s exported constants**
  (`COLORS`, `SPACING`, `RADII`, `TYPE`) and plain `StyleSheet.create` —
  no styling library dependency added (design spec Decision 9).
- **Every dropdown-to-add section's add/remove writes immediately to
  Supabase** (split, activities, pains, goals, HealthKit toggle); every
  plain-field section (diet, weight, birth date, location, training
  frequency manual targets) uses a per-section explicit "Save" button, not
  autosave (design spec Decision 4).
- **Goals cap at exactly 3, enforced client-side before the Supabase call
  fires**, with an inline warning `Text`, never a silent truncation or a
  disappearing toast (design spec Decision 6).
- **Commit after every task**, matching the existing per-task commit
  convention visible in `git log`.
- **Work happens in the worktree at `C:\Dev\bulletproof-settings-healthkit`
  on branch `pipeline/settings-healthkit`** — do not touch the main
  checkout at `C:\Dev\Bulletproof`.

---

### Task 1: `lib/theme.ts` — shared calm/minimal style constants

**Files:**
- Create: `apps/mobile/lib/theme.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `COLORS`, `SPACING`, `RADII`, `TYPE` constants and `cardStyle`,
  `sectionTitleStyle`, `labelStyle` `StyleSheet` fragments, imported by
  every later task's screen/component files.

- [ ] **Step 1: create `apps/mobile/lib/theme.ts`**

```ts
// apps/mobile/lib/theme.ts
//
// Shared calm/minimal, Oura-inspired style constants for the mobile app's
// screens. Plain constants + StyleSheet fragments, not a styling library
// dependency -- every existing screen in this repo already uses RN's
// built-in StyleSheet.create (sign-in.tsx, the tab stubs), and adding a
// styling package for one screen would be exactly the over-engineering
// CLAUDE.md's conventions warn against. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 9 for the palette rationale.
import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#F7F5F2',
  card: '#FFFFFF',
  ink: '#1C1B1A',
  muted: '#8A8580',
  accent: '#3A6B5C',
  accentMuted: '#DCE6E2',
  border: '#E7E3DC',
  danger: '#B3261E',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const RADII = {
  card: 16,
  chip: 999,
  button: 12,
} as const;

export const TYPE = {
  screenTitle: { fontSize: 22, fontWeight: '700' as const, color: COLORS.ink },
  sectionTitle: { fontSize: 17, fontWeight: '600' as const, color: COLORS.ink },
  label: { fontSize: 14, fontWeight: '500' as const, color: COLORS.ink },
  helper: { fontSize: 13, fontWeight: '400' as const, color: COLORS.muted },
  body: { fontSize: 15, fontWeight: '400' as const, color: COLORS.ink },
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screenContent: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: {
    ...TYPE.sectionTitle,
  },
  helperText: {
    ...TYPE.helper,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentMuted,
    borderRadius: RADII.chip,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  chipText: {
    ...TYPE.body,
    color: COLORS.accent,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...TYPE.body,
    color: COLORS.card,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    fontSize: 15,
    color: COLORS.ink,
  },
  warningText: {
    ...TYPE.helper,
    color: COLORS.danger,
  },
});
```

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: existing `lib/*.test.ts`
suite still passes (this task adds a new file with no test, touches
nothing else). Run `npx tsc --noEmit` from `apps/mobile/`. Expected: clean
compile.

- [ ] **Step 3: commit**

```bash
git add apps/mobile/lib/theme.ts
git commit -m "feat: add shared calm/minimal theme constants for mobile screens"
```

---

### Task 2: `healthkitMapping.ts` — pure day-bucketing helpers for quantity and sleep samples

**Files:**
- Modify: `apps/mobile/lib/healthkitMapping.ts`
- Modify: `apps/mobile/lib/__tests__/healthkitMapping.test.ts`

**Interfaces:**
- Consumes: `localDateString` (already exported, unchanged).
- Produces: `MinimalQuantitySample`, `MinimalSleepSample` types,
  `sumQuantityByLocalDate(samples: readonly MinimalQuantitySample[]): Map<string, number>`,
  `sumSleepMinutesByLocalDate(samples: readonly MinimalSleepSample[]): Map<string, number>`,
  `mergeDailyMetricsIntoActivityRows(calories: Map<string, number>, steps: Map<string, number>): DailyMetricsRow[]`
  — all consumed by Task 3's `healthkitSync.ts` changes.

- [ ] **Step 1: write the failing tests**

Append to `apps/mobile/lib/__tests__/healthkitMapping.test.ts` (after the
existing `toActivityRows` describe block):

```ts
import {
  groupWorkoutsByLocalDate,
  localDateString,
  mergeDailyMetricsIntoActivityRows,
  sumQuantityByLocalDate,
  sumSleepMinutesByLocalDate,
  toActivityRows,
  type MinimalQuantitySample,
  type MinimalSleepSample,
  type MinimalWorkoutSample,
} from '../healthkitMapping';

function quantitySample(overrides: Partial<MinimalQuantitySample>): MinimalQuantitySample {
  return {
    startDate: new Date(2026, 5, 20, 8, 0),
    endDate: new Date(2026, 5, 20, 8, 0),
    quantity: 100,
    ...overrides,
  };
}

function sleepSample(overrides: Partial<MinimalSleepSample>): MinimalSleepSample {
  return {
    startDate: new Date(2026, 5, 19, 23, 0),
    endDate: new Date(2026, 5, 20, 6, 0),
    categoryValue: 'asleepCore',
    ...overrides,
  };
}

describe('sumQuantityByLocalDate', () => {
  it('sums multiple samples on the same local date', () => {
    const samples = [
      quantitySample({ startDate: new Date(2026, 5, 20, 8, 0), quantity: 300 }),
      quantitySample({ startDate: new Date(2026, 5, 20, 18, 0), quantity: 200 }),
    ];

    const result = sumQuantityByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(500);
  });

  it('keeps separate dates in separate buckets', () => {
    const samples = [
      quantitySample({ startDate: new Date(2026, 5, 20, 8, 0), quantity: 300 }),
      quantitySample({ startDate: new Date(2026, 5, 21, 8, 0), quantity: 150 }),
    ];

    const result = sumQuantityByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(300);
    expect(result.get('2026-06-21')).toBe(150);
  });

  it('returns an empty map for no samples', () => {
    expect(sumQuantityByLocalDate([]).size).toBe(0);
  });
});

describe('sumSleepMinutesByLocalDate', () => {
  it('sums asleep-bucket durations and excludes inBed/awake', () => {
    const samples = [
      sleepSample({
        startDate: new Date(2026, 5, 19, 23, 0),
        endDate: new Date(2026, 5, 20, 1, 0),
        categoryValue: 'asleepCore',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 0),
        endDate: new Date(2026, 5, 20, 1, 15),
        categoryValue: 'awake',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 15),
        endDate: new Date(2026, 5, 20, 6, 15),
        categoryValue: 'asleepDeep',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 19, 22, 30),
        endDate: new Date(2026, 5, 19, 23, 0),
        categoryValue: 'inBed',
      }),
    ];

    const result = sumSleepMinutesByLocalDate(samples);

    // bucketed by the sample's *start* local date: 120 + 300 = 420 minutes
    // on 2026-06-19 (23:00-01:00 starts on the 19th) + (01:15-06:15 starts
    // on the 20th) -- see Step 3's implementation for the exact bucketing
    // rule (by startDate's local date, matching groupWorkoutsByLocalDate).
    expect(result.get('2026-06-19')).toBe(120);
    expect(result.get('2026-06-20')).toBe(300);
  });

  it('treats asleepUnspecified and asleep as asleep-bucket', () => {
    const samples = [
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 0),
        endDate: new Date(2026, 5, 20, 2, 0),
        categoryValue: 'asleep',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 2, 0),
        endDate: new Date(2026, 5, 20, 2, 30),
        categoryValue: 'asleepUnspecified',
      }),
    ];

    const result = sumSleepMinutesByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(90);
  });

  it('returns an empty map for no samples', () => {
    expect(sumSleepMinutesByLocalDate([]).size).toBe(0);
  });
});

describe('mergeDailyMetricsIntoActivityRows', () => {
  it('produces one partial row per date present in either map', () => {
    const calories = new Map([['2026-06-20', 2200]]);
    const steps = new Map([
      ['2026-06-20', 8000],
      ['2026-06-21', 5000],
    ]);

    const rows = mergeDailyMetricsIntoActivityRows(calories, steps);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.date === '2026-06-20')).toEqual({
      date: '2026-06-20',
      total_calories: 2200,
      steps: 8000,
    });
    expect(rows.find((r) => r.date === '2026-06-21')).toEqual({
      date: '2026-06-21',
      total_calories: null,
      steps: 5000,
    });
  });

  it('returns an empty array when both maps are empty', () => {
    expect(mergeDailyMetricsIntoActivityRows(new Map(), new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: run the tests to verify they fail**

Run `npm test --prefix apps/mobile -- healthkitMapping`. Expected: FAIL —
`sumQuantityByLocalDate`, `sumSleepMinutesByLocalDate`,
`mergeDailyMetricsIntoActivityRows`, `MinimalQuantitySample`,
`MinimalSleepSample` are not exported yet.

- [ ] **Step 3: implement the minimal code to make the tests pass**

Add to `apps/mobile/lib/healthkitMapping.ts` (after the existing
`MinimalWorkoutSample` interface, before `ActivityWorkoutEntry`):

```ts
export interface MinimalQuantitySample {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly quantity: number;
}

/**
 * The subset of CategoryValueSleepAnalysis values (per
 * @kingstinct/react-native-healthkit's generated enum) that count as
 * "asleep" for this app's purposes -- excludes inBed/awake. See
 * docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
 * Decision 1.
 */
export type SleepCategoryValue =
  | 'inBed'
  | 'asleepUnspecified'
  | 'asleep'
  | 'awake'
  | 'asleepCore'
  | 'asleepDeep'
  | 'asleepREM';

const ASLEEP_BUCKET: ReadonlySet<SleepCategoryValue> = new Set([
  'asleepUnspecified',
  'asleep',
  'asleepCore',
  'asleepDeep',
  'asleepREM',
]);

export interface MinimalSleepSample {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly categoryValue: SleepCategoryValue;
}

export interface DailyMetricsRow {
  date: string;
  total_calories: number | null;
  steps: number | null;
}
```

Add these functions at the end of the file (after `toActivityRows`):

```ts
/**
 * Sums a quantity sample's `quantity` field per local calendar date of its
 * start time. Used for ActiveEnergyBurned, DistanceWalkingRunning, and
 * StepCount -- all three are additive day totals, unlike heart rate which
 * is a point-in-time reading (not summed; see healthkitSync.ts for how the
 * most-recent heart-rate sample is surfaced instead).
 */
export function sumQuantityByLocalDate(
  samples: readonly MinimalQuantitySample[]
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const sample of samples) {
    const day = localDateString(sample.startDate);
    sums.set(day, (sums.get(day) ?? 0) + sample.quantity);
  }
  return sums;
}

/**
 * Sums sleep-analysis sample durations (in minutes) per local calendar
 * date of each sample's start time, counting only "asleep" bucket values
 * (asleep/asleepUnspecified/asleepCore/asleepDeep/asleepREM) -- inBed and
 * awake periods are excluded, matching how this app wants "time actually
 * asleep," not "time in bed."
 */
export function sumSleepMinutesByLocalDate(
  samples: readonly MinimalSleepSample[]
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const sample of samples) {
    if (!ASLEEP_BUCKET.has(sample.categoryValue)) {
      continue;
    }
    const day = localDateString(sample.startDate);
    const minutes = (sample.endDate.getTime() - sample.startDate.getTime()) / 60000;
    sums.set(day, (sums.get(day) ?? 0) + minutes);
  }
  return sums;
}

/**
 * Merges day-bucketed calories and steps maps into partial `activity`-row
 * updates -- one row per date present in either map, with the other
 * field null if that date has no data for it. Intended for a narrower
 * upsert than toActivityRows' full row shape: Postgres upsert only
 * updates the columns actually listed, so layering this on top of
 * whatever syncHealthKitWorkouts() already wrote for that date is safe
 * (it does not null out workouts/workout_count).
 */
export function mergeDailyMetricsIntoActivityRows(
  calories: Map<string, number>,
  steps: Map<string, number>
): DailyMetricsRow[] {
  const dates = new Set<string>([...calories.keys(), ...steps.keys()]);
  const rows: DailyMetricsRow[] = [];
  for (const date of dates) {
    rows.push({
      date,
      total_calories: calories.get(date) ?? null,
      steps: steps.get(date) ?? null,
    });
  }
  return rows;
}
```

- [ ] **Step 4: run the tests to verify they pass**

Run `npm test --prefix apps/mobile -- healthkitMapping`. Expected: all
tests pass, including the pre-existing `toActivityRows`/
`groupWorkoutsByLocalDate`/`localDateString` ones (unchanged).

- [ ] **Step 5: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: full suite passes. Run
`npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile.

- [ ] **Step 6: commit**

```bash
git add apps/mobile/lib/healthkitMapping.ts apps/mobile/lib/__tests__/healthkitMapping.test.ts
git commit -m "feat: add day-bucketing helpers for HealthKit quantity and sleep samples"
```

---

### Task 3: `healthkitSync.ts` — expand permissions and add `syncHealthKitDailyMetrics()`

**Files:**
- Modify: `apps/mobile/lib/healthkitSync.ts`

**Interfaces:**
- Consumes: `sumQuantityByLocalDate`, `sumSleepMinutesByLocalDate`,
  `mergeDailyMetricsIntoActivityRows` from Task 2.
- Produces: `syncHealthKitDailyMetrics(): Promise<void>`, exported
  alongside the existing `syncHealthKitWorkouts`, consumed by Task 4's
  `app/_layout.tsx` change.

- [ ] **Step 1: expand `READ_PERMISSIONS`**

In `apps/mobile/lib/healthkitSync.ts`, replace the existing
`READ_PERMISSIONS` block and its comment:

```ts
/**
 * HealthKit read permissions this app requests. `WorkoutTypeIdentifier` is
 * queried by syncHealthKitWorkouts(); the quantity types
 * (ActiveEnergyBurned/DistanceWalkingRunning/StepCount) and the new sleep
 * category type are queried by syncHealthKitDailyMetrics() below -- see
 * docs/superpowers/specs/2026-06-24-settings-healthkit-design.md Decision 2
 * for what's queried-and-persisted vs. queried-and-only-summarized.
 * Heart rate (current + resting) is queried for the Settings screen's
 * "what we read" disclosure only; neither is persisted to any table this
 * phase (recovery stays Oura-sourced).
 */
const READ_PERMISSIONS: readonly (
  | typeof WorkoutTypeIdentifier
  | QuantityTypeIdentifier
  | CategoryTypeIdentifier
)[] = [
  WorkoutTypeIdentifier,
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
];
```

- [ ] **Step 2: update the imports**

Replace the existing import block at the top of the file:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import HealthKit, {
  WorkoutActivityType,
  WorkoutTypeIdentifier,
  queryQuantitySamples,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import type {
  CategoryTypeIdentifier,
  QuantityTypeIdentifier,
  WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import { supabase } from './supabase';
import {
  groupWorkoutsByLocalDate,
  mergeDailyMetricsIntoActivityRows,
  sumQuantityByLocalDate,
  sumSleepMinutesByLocalDate,
  toActivityRows,
  type MinimalQuantitySample,
  type MinimalSleepSample,
  type MinimalWorkoutSample,
  type SleepCategoryValue,
} from './healthkitMapping';
```

- [ ] **Step 3: add `syncHealthKitDailyMetrics()`**

Append to the end of `apps/mobile/lib/healthkitSync.ts`:

```ts
/**
 * Reads HealthKit ActiveEnergyBurned/DistanceWalkingRunning/StepCount
 * quantity samples and SleepAnalysis category samples since the last
 * sync, sums calories and steps per local day, and upserts only those two
 * columns into the `activity` table -- a narrower upsert than
 * syncHealthKitWorkouts()'s full-row upsert, so it does not clobber
 * workouts/workout_count already written for the same date. Distance and
 * sleep totals are computed but not persisted this phase (see design spec
 * Decision 2) -- callers needing a human-readable summary of what was read
 * should call this and inspect its return value rather than relying on a
 * side effect.
 *
 * Same fail-soft contract as syncHealthKitWorkouts(): unavailable
 * HealthKit, denied permission, or a query/upsert error all skip silently
 * rather than throwing, since this is read-augmentation, never a gate on
 * app usability.
 */
export interface DailyMetricsSyncSummary {
  daysWithCalories: number;
  daysWithSteps: number;
  totalDistanceMeters: number;
  totalSleepMinutes: number;
  mostRecentHeartRateBpm: number | null;
  mostRecentRestingHeartRateBpm: number | null;
}

const EMPTY_SUMMARY: DailyMetricsSyncSummary = {
  daysWithCalories: 0,
  daysWithSteps: 0,
  totalDistanceMeters: 0,
  totalSleepMinutes: 0,
  mostRecentHeartRateBpm: null,
  mostRecentRestingHeartRateBpm: null,
};

function toMinimalQuantitySample(sample: {
  startDate: Date;
  endDate: Date;
  quantity: number;
}): MinimalQuantitySample {
  return { startDate: sample.startDate, endDate: sample.endDate, quantity: sample.quantity };
}

function toMinimalSleepSample(sample: {
  startDate: Date;
  endDate: Date;
  value: SleepCategoryValue;
}): MinimalSleepSample {
  return {
    startDate: sample.startDate,
    endDate: sample.endDate,
    categoryValue: sample.value,
  };
}

export async function syncHealthKitDailyMetrics(): Promise<DailyMetricsSyncSummary> {
  const available = await HealthKit.isHealthDataAvailable();
  if (!available) {
    return EMPTY_SUMMARY;
  }

  try {
    await HealthKit.requestAuthorization({ toRead: READ_PERMISSIONS });
  } catch (err) {
    console.warn('HealthKit authorization request failed or was denied:', err);
    return EMPTY_SUMMARY;
  }

  const since = await getSinceDate();
  const filter = { startDate: { startDate: since } };

  let activeEnergySamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let distanceSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let stepSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let sleepSamples: readonly { startDate: Date; endDate: Date; value: SleepCategoryValue }[] = [];
  let heartRateSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let restingHeartRateSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];

  try {
    [
      activeEnergySamples,
      distanceSamples,
      stepSamples,
      sleepSamples,
      heartRateSamples,
      restingHeartRateSamples,
    ] = await Promise.all([
      queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierDistanceWalkingRunning', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierStepCount', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        filter,
        limit: 0,
        ascending: false,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
        filter,
        limit: 0,
        ascending: false,
      }),
    ]);
  } catch (err) {
    console.warn('HealthKit daily metrics query failed:', err);
    return EMPTY_SUMMARY;
  }

  const caloriesByDay = sumQuantityByLocalDate(activeEnergySamples.map(toMinimalQuantitySample));
  const distanceByDay = sumQuantityByLocalDate(distanceSamples.map(toMinimalQuantitySample));
  const stepsByDay = sumQuantityByLocalDate(stepSamples.map(toMinimalQuantitySample));
  const sleepMinutesByDay = sumSleepMinutesByLocalDate(sleepSamples.map(toMinimalSleepSample));

  const rows = mergeDailyMetricsIntoActivityRows(caloriesByDay, stepsByDay);
  if (rows.length > 0) {
    const { error } = await supabase
      .from('activity')
      .upsert(rows, { onConflict: 'date' });
    if (error) {
      console.warn('Failed to upsert HealthKit daily metrics into activity:', error.message);
      return EMPTY_SUMMARY;
    }
  }

  let totalDistanceMeters = 0;
  for (const meters of distanceByDay.values()) {
    totalDistanceMeters += meters;
  }
  let totalSleepMinutes = 0;
  for (const minutes of sleepMinutesByDay.values()) {
    totalSleepMinutes += minutes;
  }

  return {
    daysWithCalories: caloriesByDay.size,
    daysWithSteps: stepsByDay.size,
    totalDistanceMeters,
    totalSleepMinutes,
    mostRecentHeartRateBpm: heartRateSamples[0]?.quantity ?? null,
    mostRecentRestingHeartRateBpm: restingHeartRateSamples[0]?.quantity ?? null,
  };
}
```

Note: this task does not update `getSinceDate()`/`LAST_SYNCED_STORAGE_KEY`
— both functions stay shared/unchanged from `syncHealthKitWorkouts()`, so
the two sync functions always look back from the same timestamp; only
`syncHealthKitWorkouts()` advances the stored timestamp on success (its
existing behavior, unchanged), since it's the original, primary sync path
and this task does not want two independent timestamp writers racing each
other.

- [ ] **Step 4: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: all `lib/*.test.ts` still
pass (this task changes only `healthkitSync.ts`, which has no dedicated
test file — it depends on the native HealthKit module and cannot be unit
tested without one, consistent with the original HealthKit-sync phase's
testing plan). Run `npx tsc --noEmit` from `apps/mobile/`. Expected: clean
compile — this is the actual verification for this task, since
`queryQuantitySamples`/`queryCategorySamples`/the new type identifiers
must type-check against the real installed `@kingstinct/react-native-
healthkit` v14.0.2 type definitions.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/lib/healthkitSync.ts
git commit -m "feat: query ActiveEnergyBurned/DistanceWalkingRunning/StepCount/SleepAnalysis/HeartRate via syncHealthKitDailyMetrics"
```

---

### Task 4: Wire `syncHealthKitDailyMetrics()` into `app/_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `syncHealthKitDailyMetrics` from Task 3.
- Produces: the daily-metrics sync actually firing on launch/foreground,
  alongside the existing `syncHealthKitWorkouts()` call — no new exported
  interface (this is a call-site-only change).

- [ ] **Step 1: add the import and call sites**

In `apps/mobile/app/_layout.tsx`, change the existing HealthKit import:

```ts
import { syncHealthKitWorkouts, syncHealthKitDailyMetrics } from '../lib/healthkitSync';
```

Update both existing `syncHealthKitWorkouts().catch(...)` call sites (one
in the sign-in effect, one in the `AppState` foreground listener) to also
fire `syncHealthKitDailyMetrics()` alongside it. The launch-effect call
site changes from:

```ts
    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });
    loadRecommendations();
```

to:

```ts
    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });
    syncHealthKitDailyMetrics().catch((err) => {
      console.warn('HealthKit daily metrics sync failed on launch:', err);
    });
    loadRecommendations();
```

And the foreground-listener call site changes from:

```ts
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
        loadRecommendations();
      }
```

to:

```ts
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
        syncHealthKitDailyMetrics().catch((err) => {
          console.warn('HealthKit daily metrics sync failed on foreground:', err);
        });
        loadRecommendations();
      }
```

Both calls fire independently (neither `await`s the other) so a slow or
failing daily-metrics query never delays the workouts sync or the
recommendations fetch — consistent with every HealthKit call in this app
being fire-and-forget background plumbing, never a blocking gate.

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: all tests still pass (no
test file covers `_layout.tsx` directly — same as the mobile-nav phase's
precedent for this file). Run `npx tsc --noEmit` from `apps/mobile/`.
Expected: clean compile.

- [ ] **Step 3: commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat: fire syncHealthKitDailyMetrics alongside the existing workout sync"
```

---

### Task 5: `components/DropdownAddSection.tsx` — reusable pick-to-add list control

**Files:**
- Create: `apps/mobile/components/DropdownAddSection.tsx`

**Interfaces:**
- Consumes: `apps/mobile/lib/theme.ts`'s `sharedStyles`/`COLORS`/`SPACING`
  (Task 1).
- Produces: `DropdownAddSection<T>` component, default-exported, with the
  props shape below — consumed by Task 6 (Settings screen) for the Split/
  Activities/Goals/Pains-picker sections.

- [ ] **Step 1: create `apps/mobile/components/DropdownAddSection.tsx`**

```tsx
// apps/mobile/components/DropdownAddSection.tsx
//
// Generic "pick from a list of {id, label} options not already selected,
// tap to add, tap an added entry's x to remove" control. Four Settings
// sections (preferred split, activities, goals, the pains body-part
// picker) share this exact interaction -- see
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 10 for why this is the one shared abstraction this phase
// introduces.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles } from '../lib/theme';

export interface DropdownOption {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
}

export interface DropdownAddSectionProps {
  readonly title: string;
  readonly options: readonly DropdownOption[];
  readonly selectedIds: readonly string[];
  readonly onAdd: (id: string) => void;
  readonly onRemove: (id: string) => void;
  /** Single-select mode: adding replaces the current selection instead of appending. */
  readonly singleSelect?: boolean;
  /** Disables the add affordance (e.g. goals at the 3-item cap) without hiding it. */
  readonly addDisabled?: boolean;
  readonly addDisabledMessage?: string;
}

function groupOptions(
  options: readonly DropdownOption[]
): { group: string | null; items: DropdownOption[] }[] {
  const order: (string | null)[] = [];
  const byGroup = new Map<string | null, DropdownOption[]>();
  for (const option of options) {
    const key = option.group ?? null;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(option);
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}

export default function DropdownAddSection({
  title,
  options,
  selectedIds,
  onAdd,
  onRemove,
  singleSelect = false,
  addDisabled = false,
  addDisabledMessage,
}: DropdownAddSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = options.filter((option) => selectedIds.includes(option.id));
  const available = singleSelect
    ? options
    : options.filter((option) => !selectedIds.includes(option.id));
  const grouped = groupOptions(available);

  function handlePick(id: string) {
    onAdd(id);
    setPickerOpen(false);
  }

  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>{title}</Text>

      <View style={styles.chipRow}>
        {selected.map((option) => (
          <View key={option.id} style={sharedStyles.chip}>
            <Text style={sharedStyles.chipText}>{option.label}</Text>
            {!singleSelect && (
              <Pressable onPress={() => onRemove(option.id)} accessibilityLabel={`Remove ${option.label}`}>
                <Text style={sharedStyles.chipText}>{'×'}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {selected.length === 0 && (
          <Text style={sharedStyles.helperText}>Nothing added yet.</Text>
        )}
      </View>

      <Pressable
        style={[styles.addButton, addDisabled && styles.addButtonDisabled]}
        onPress={() => !addDisabled && setPickerOpen(true)}
        disabled={addDisabled}
      >
        <Text style={styles.addButtonText}>
          {singleSelect ? 'Change' : '+ Add'}
        </Text>
      </Pressable>
      {addDisabled && addDisabledMessage && (
        <Text style={sharedStyles.warningText}>{addDisabledMessage}</Text>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <ScrollView>
              {grouped.map(({ group, items }) => (
                <View key={group ?? '__ungrouped'}>
                  {group && <Text style={styles.groupLabel}>{group}</Text>}
                  {items.map((option) => (
                    <Pressable
                      key={option.id}
                      style={styles.optionRow}
                      onPress={() => handlePick(option.id)}
                    >
                      <Text style={sharedStyles.body ? undefined : undefined}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              {available.length === 0 && (
                <Text style={sharedStyles.helperText}>Everything has already been added.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addButtonDisabled: {
    borderColor: COLORS.border,
  },
  addButtonText: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: SPACING.md,
  },
  groupLabel: {
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  optionRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
```

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing (no test
file for this component — RN component-render tests are out of scope per
Global Constraints). Run `npx tsc --noEmit` from `apps/mobile/`. Expected:
clean compile.

- [ ] **Step 3: commit**

```bash
git add apps/mobile/components/DropdownAddSection.tsx
git commit -m "feat: add reusable DropdownAddSection component"
```

---

### Task 6: `components/PainEntryRow.tsx` — severity buttons + note editor

**Files:**
- Create: `apps/mobile/components/PainEntryRow.tsx`

**Interfaces:**
- Consumes: `apps/mobile/lib/theme.ts` (Task 1).
- Produces: `PainEntryRow` component, default-exported, props shape below
  — consumed by Task 8 (Settings screen Pains section). Defines the
  `PainEntry` type other tasks reference.

- [ ] **Step 1: create `apps/mobile/components/PainEntryRow.tsx`**

```tsx
// apps/mobile/components/PainEntryRow.tsx
//
// One added pain's expanded editor: a stepped row of 10 tappable severity
// buttons (1-10) plus a free-text note field and a remove action. Always
// rendered expanded, not collapsed-then-expand-on-tap -- there are at
// most ~12 possible pains, never enough to need a collapse-by-default
// list-density optimization. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decisions 5 and 10.
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING, sharedStyles } from '../lib/theme';

export interface PainEntry {
  body_part: string;
  severity: number;
  note: string;
  since: string | null;
}

export interface PainEntryRowProps {
  readonly label: string;
  readonly entry: PainEntry;
  readonly onChange: (next: PainEntry) => void;
  readonly onRemove: () => void;
}

const SEVERITY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function PainEntryRow({ label, entry, onChange, onRemove }: PainEntryRowProps) {
  return (
    <View style={[sharedStyles.card, styles.container]}>
      <View style={styles.headerRow}>
        <Text style={sharedStyles.sectionTitle}>{label}</Text>
        <Pressable onPress={onRemove} accessibilityLabel={`Remove ${label}`}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <Text style={sharedStyles.helperText}>Severity</Text>
      <View style={styles.severityRow}>
        {SEVERITY_LEVELS.map((level) => {
          const active = entry.severity === level;
          return (
            <Pressable
              key={level}
              style={[styles.severityButton, active && styles.severityButtonActive]}
              onPress={() => onChange({ ...entry, severity: level })}
              accessibilityLabel={`Severity ${level}`}
            >
              <Text style={[styles.severityText, active && styles.severityTextActive]}>
                {level}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={sharedStyles.helperText}>Note</Text>
      <TextInput
        style={[sharedStyles.textInput, styles.noteInput]}
        value={entry.note}
        onChangeText={(text) => onChange({ ...entry, note: text })}
        placeholder="Anything worth remembering about this"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeText: {
    color: COLORS.danger,
    fontWeight: '600',
  },
  severityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  severityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  severityText: {
    color: COLORS.ink,
    fontWeight: '600',
  },
  severityTextActive: {
    color: COLORS.card,
  },
  noteInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
```

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing. Run
`npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile.

- [ ] **Step 3: commit**

```bash
git add apps/mobile/components/PainEntryRow.tsx
git commit -m "feat: add PainEntryRow severity+note editor component"
```

---

### Task 7: `components/HealthKitSection.tsx` + install `expo-location`

**Files:**
- Create: `apps/mobile/components/HealthKitSection.tsx`
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/package-lock.json` (auto-updated)
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: `apps/mobile/lib/theme.ts` (Task 1).
- Produces: `HealthKitSection` component, default-exported, props
  `{ enabled: boolean; onToggle: (next: boolean) => void }` — consumed by
  Task 8. `expo-location` available for Task 9's location fields.

- [ ] **Step 1: install `expo-location`**

From `apps/mobile/`, run:

```bash
npx expo install expo-location
```

This resolves and installs a version compatible with the pinned
`expo@~56.0.12`. Do not hand-edit the resolved version.

- [ ] **Step 2: add the location permission description to `app.json`**

Add `NSLocationWhenInUseUsageDescription` to the existing
`ios.infoPlist` object in `apps/mobile/app.json` (alongside the existing
`ITSAppUsesNonExemptEncryption` key):

```json
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSLocationWhenInUseUsageDescription": "Bulletproof uses your location to label your training location and timezone in Settings. This is optional and only used when you tap \"Use current location.\""
      }
```

- [ ] **Step 3: create `apps/mobile/components/HealthKitSection.tsx`**

```tsx
// apps/mobile/components/HealthKitSection.tsx
//
// The Settings screen's HealthKit section: a sync-enable toggle bound to
// user_profile.healthkit_sync_enabled, plus a static "what we read"
// disclosure list. Explicitly read-only -- this app has never requested
// HealthKit write/share permissions and never will via this section. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md Goals.
import { Switch, Text, View } from 'react-native';
import { sharedStyles } from '../lib/theme';

export interface HealthKitSectionProps {
  readonly enabled: boolean;
  readonly onToggle: (next: boolean) => void;
}

const WHAT_WE_READ = [
  'Workouts (type, duration, calories, distance) -- pickleball, running, gym sessions',
  'Active calories burned and step count, per day',
  'Sleep analysis, per night',
  'Heart rate and resting heart rate',
];

export default function HealthKitSection({ enabled, onToggle }: HealthKitSectionProps) {
  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>HealthKit</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={sharedStyles.body as any}>Sync with Apple Health</Text>
        <Switch value={enabled} onValueChange={onToggle} />
      </View>

      <Text style={sharedStyles.helperText}>
        Read-only. Bulletproof never writes any data to Apple Health. What we read:
      </Text>
      {WHAT_WE_READ.map((line) => (
        <Text key={line} style={sharedStyles.helperText}>
          {'•'} {line}
        </Text>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing. Run
`npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/app.json apps/mobile/components/HealthKitSection.tsx
git commit -m "feat: add HealthKitSection component and install expo-location"
```

---

### Task 8: `app/(tabs)/settings.tsx` — data loading, Split/Activities/Goals/Pains sections

**Files:**
- Modify: `apps/mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `DropdownAddSection`/`DropdownOption` (Task 5), `PainEntryRow`/
  `PainEntry` (Task 6), `HealthKitSection` (Task 7), `apps/mobile/lib/
  theme.ts` (Task 1), `apps/mobile/lib/supabase.ts`'s `supabase` (existing).
- Produces: the real Settings screen's data-loading scaffold and the
  Split/Activities/Goals/Pains/HealthKit sections — Task 9 extends this
  same file with Training Frequency/Diet/Weight/Birth Date/Location.

- [ ] **Step 1: replace `apps/mobile/app/(tabs)/settings.tsx`**

```tsx
// apps/mobile/app/(tabs)/settings.tsx
//
// The Settings screen: preferred split, activities, pains, goals,
// training frequency, diet, weight/birth date, location, and HealthKit.
// Loads user_profile + the 4 taxonomy tables once on mount; each
// dropdown-to-add section (split/activities/goals/pains-picker) and the
// HealthKit toggle save immediately on change, while the plain-field
// sections (added in app/(tabs)/settings.tsx's Task 9 follow-up within
// this same file) use an explicit per-section Save button. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 4 for the save-timing rationale.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { sharedStyles, TYPE } from '../../lib/theme';
import DropdownAddSection, { type DropdownOption } from '../../components/DropdownAddSection';
import PainEntryRow, { type PainEntry } from '../../components/PainEntryRow';
import HealthKitSection from '../../components/HealthKitSection';

interface SplitTaxonomyRow {
  id: string;
  label: string;
  day_labels: string[];
}

interface ActivityTaxonomyRow {
  id: string;
  label: string;
  category: 'strength' | 'cardio' | 'recovery';
  warmup_focus_body_parts: string[];
}

interface GoalTaxonomyRow {
  id: string;
  label: string;
  description: string;
}

interface BodyPartTaxonomyRow {
  id: string;
  label: string;
}

interface UserProfileRow {
  id: string;
  owner_id: string;
  preferred_split: string;
  activities: string[];
  current_goals: string[];
  pains: PainEntry[];
  training_frequency_mode: 'manual' | 'auto';
  training_frequency_manual: { targets: Record<string, number> } | null;
  diet_preference: string | null;
  weight_kg: number | null;
  birth_date: string | null;
  location: { lat: number; lon: number; label: string; timezone: string } | null;
  healthkit_sync_enabled: boolean;
}

const GOALS_CAP = 3;

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [splits, setSplits] = useState<SplitTaxonomyRow[]>([]);
  const [activityOptions, setActivityOptions] = useState<ActivityTaxonomyRow[]>([]);
  const [goalOptions, setGoalOptions] = useState<GoalTaxonomyRow[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyPartTaxonomyRow[]>([]);

  const [goalsWarning, setGoalsWarning] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [profileRes, splitsRes, activitiesRes, goalsRes, bodyPartsRes] = await Promise.all([
        supabase.from('user_profile').select('*').single(),
        supabase.from('split_taxonomy').select('*'),
        supabase.from('activity_taxonomy').select('*'),
        supabase.from('goal_taxonomy').select('*'),
        supabase.from('body_part_taxonomy').select('*'),
      ]);

      const firstError =
        profileRes.error ?? splitsRes.error ?? activitiesRes.error ?? goalsRes.error ?? bodyPartsRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      setProfile(profileRes.data as UserProfileRow);
      setSplits((splitsRes.data ?? []) as SplitTaxonomyRow[]);
      setActivityOptions((activitiesRes.data ?? []) as ActivityTaxonomyRow[]);
      setGoalOptions((goalsRes.data ?? []) as GoalTaxonomyRow[]);
      setBodyParts((bodyPartsRes.data ?? []) as BodyPartTaxonomyRow[]);
      setLoading(false);
    }

    load();
  }, []);

  const saveProfileFields = useCallback(
    async (fields: Partial<UserProfileRow>) => {
      if (!profile) return;
      const { error } = await supabase
        .from('user_profile')
        .update(fields)
        .eq('id', profile.id);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setProfile((prev) => (prev ? { ...prev, ...fields } : prev));
    },
    [profile]
  );

  function handleSplitChange(id: string) {
    saveProfileFields({ preferred_split: id });
  }

  function handleAddActivity(id: string) {
    if (!profile) return;
    saveProfileFields({ activities: [...profile.activities, id] });
  }

  function handleRemoveActivity(id: string) {
    if (!profile) return;
    saveProfileFields({ activities: profile.activities.filter((a) => a !== id) });
  }

  function handleAddGoal(id: string) {
    if (!profile) return;
    if (profile.current_goals.length >= GOALS_CAP) {
      setGoalsWarning(`You can select up to ${GOALS_CAP} goals — remove one to add another.`);
      return;
    }
    setGoalsWarning(null);
    saveProfileFields({ current_goals: [...profile.current_goals, id] });
  }

  function handleRemoveGoal(id: string) {
    if (!profile) return;
    setGoalsWarning(null);
    saveProfileFields({ current_goals: profile.current_goals.filter((g) => g !== id) });
  }

  function handleAddPain(bodyPartId: string) {
    if (!profile) return;
    const newEntry: PainEntry = { body_part: bodyPartId, severity: 5, note: '', since: null };
    saveProfileFields({ pains: [...profile.pains, newEntry] });
  }

  function handleChangePain(index: number, next: PainEntry) {
    if (!profile) return;
    const nextPains = profile.pains.slice();
    nextPains[index] = next;
    saveProfileFields({ pains: nextPains });
  }

  function handleRemovePain(index: number) {
    if (!profile) return;
    const nextPains = profile.pains.filter((_, i) => i !== index);
    saveProfileFields({ pains: nextPains });
  }

  function handleToggleHealthKit(next: boolean) {
    saveProfileFields({ healthkit_sync_enabled: next });
  }

  if (loading) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={[TYPE.body, { padding: 16 }]}>Loading settings…</Text>
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={[TYPE.body, { padding: 16 }]}>
          Couldn't load settings: {loadError ?? 'unknown error'}
        </Text>
      </View>
    );
  }

  const splitOptions: DropdownOption[] = splits.map((s) => ({ id: s.id, label: s.label }));
  const activityDropdownOptions: DropdownOption[] = activityOptions.map((a) => ({
    id: a.id,
    label: a.label,
    group: a.category.charAt(0).toUpperCase() + a.category.slice(1),
  }));
  const goalDropdownOptions: DropdownOption[] = goalOptions.map((g) => ({ id: g.id, label: g.label }));
  const bodyPartDropdownOptions: DropdownOption[] = bodyParts.map((b) => ({ id: b.id, label: b.label }));

  const bodyPartLabel = (id: string) => bodyParts.find((b) => b.id === id)?.label ?? id;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Settings</Text>

      <DropdownAddSection
        title="Preferred Split"
        options={splitOptions}
        selectedIds={[profile.preferred_split]}
        onAdd={handleSplitChange}
        onRemove={() => {}}
        singleSelect
      />

      <DropdownAddSection
        title="Activities"
        options={activityDropdownOptions}
        selectedIds={profile.activities}
        onAdd={handleAddActivity}
        onRemove={handleRemoveActivity}
      />

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Goals</Text>
        <Text style={sharedStyles.helperText}>Choose up to {GOALS_CAP}.</Text>
      </View>
      <DropdownAddSection
        title=""
        options={goalDropdownOptions}
        selectedIds={profile.current_goals}
        onAdd={handleAddGoal}
        onRemove={handleRemoveGoal}
        addDisabled={profile.current_goals.length >= GOALS_CAP}
        addDisabledMessage={goalsWarning ?? undefined}
      />

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Pains</Text>
        <DropdownAddSection
          title=""
          options={bodyPartDropdownOptions}
          selectedIds={[]}
          onAdd={handleAddPain}
          onRemove={() => {}}
        />
      </View>
      {profile.pains.map((pain, index) => (
        <PainEntryRow
          key={`${pain.body_part}-${index}`}
          label={bodyPartLabel(pain.body_part)}
          entry={pain}
          onChange={(next) => handleChangePain(index, next)}
          onRemove={() => handleRemovePain(index)}
        />
      ))}

      <HealthKitSection
        enabled={profile.healthkit_sync_enabled}
        onToggle={handleToggleHealthKit}
      />
    </ScrollView>
  );
}
```

Note: the Goals/Pains-picker `DropdownAddSection` instances pass
`title=""` because their parent `View` already renders the section title —
`DropdownAddSection` always renders a `Text` for `title`, and an empty
string renders as an empty (zero-height-ish) line. This is intentionally
simple for this task; Task 9 does not touch this, but flagging it here
since it's a minor visual wart a future pass could clean up by giving
`DropdownAddSection` an optional `title` instead of a required one — not
done in this task to avoid scope creep into Task 5's already-committed
component.

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: all `lib/*.test.ts` still
pass (this task touches no `lib/` files). Run `npx tsc --noEmit` from
`apps/mobile/`. Expected: clean compile.

- [ ] **Step 3: commit**

```bash
git add "apps/mobile/app/(tabs)/settings.tsx"
git commit -m "feat: build Settings screen data loading, Split/Activities/Goals/Pains, HealthKit sections"
```

---

### Task 9: Extend `settings.tsx` — Training Frequency, Diet, Weight, Birth Date, Location

**Files:**
- Modify: `apps/mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `expo-location` (Task 7), everything from Task 8.
- Produces: the complete Settings screen — no further tasks extend this
  file.

- [ ] **Step 1: add the remaining local state and save handlers**

In `apps/mobile/app/(tabs)/settings.tsx`, add to the imports:

```tsx
import { Pressable, StyleSheet, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING } from '../../lib/theme';
```

(merge `Pressable`/`StyleSheet`/`TextInput` into the existing
`react-native` import line from Task 8 rather than adding a second import
line for the same module; merge `COLORS, SPACING` into the existing
`lib/theme` import line.)

Add this local state, just below the `goalsWarning` state declared in
Task 8:

```tsx
  const [dietDraft, setDietDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');
  const [birthDateDraft, setBirthDateDraft] = useState('');
  const [locationLabelDraft, setLocationLabelDraft] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [frequencyTargetsDraft, setFrequencyTargetsDraft] = useState<Record<string, string>>({});
```

Add a second `useEffect`, just below the data-loading `useEffect` from
Task 8, to seed the drafts once `profile` loads:

```tsx
  useEffect(() => {
    if (!profile) return;
    setDietDraft(profile.diet_preference ?? '');
    setWeightDraft(profile.weight_kg != null ? String(profile.weight_kg) : '');
    setBirthDateDraft(profile.birth_date ?? '');
    setLocationLabelDraft(profile.location?.label ?? '');
    const targets = profile.training_frequency_manual?.targets ?? {};
    const draftEntries: Record<string, string> = {};
    for (const key of [...profile.activities, ...getSplitDayLabels()]) {
      draftEntries[key] = targets[key] != null ? String(targets[key]) : '';
    }
    setFrequencyTargetsDraft(draftEntries);

    function getSplitDayLabels(): string[] {
      const split = splits.find((s) => s.id === profile?.preferred_split);
      return split?.day_labels ?? [];
    }
  }, [profile, splits]);
```

Add these handlers, just below `handleToggleHealthKit` from Task 8:

```tsx
  function handleSetTrainingFrequencyMode(mode: 'manual' | 'auto') {
    saveProfileFields({ training_frequency_mode: mode });
  }

  function handleSaveTrainingFrequencyTargets() {
    const targets: Record<string, number> = {};
    for (const [key, value] of Object.entries(frequencyTargetsDraft)) {
      const parsed = Number(value);
      if (value.trim() !== '' && !Number.isNaN(parsed)) {
        targets[key] = parsed;
      }
    }
    saveProfileFields({ training_frequency_manual: { targets } });
  }

  function handleSaveDiet() {
    saveProfileFields({ diet_preference: dietDraft.trim() === '' ? null : dietDraft.trim() });
  }

  function handleSaveWeight() {
    const parsed = Number(weightDraft);
    saveProfileFields({ weight_kg: weightDraft.trim() === '' || Number.isNaN(parsed) ? null : parsed });
  }

  function handleSaveBirthDate() {
    saveProfileFields({ birth_date: birthDateDraft.trim() === '' ? null : birthDateDraft.trim() });
  }

  async function handleSaveLocationLabel() {
    const next = profile?.location
      ? { ...profile.location, label: locationLabelDraft }
      : { lat: 0, lon: 0, label: locationLabelDraft, timezone: '' };
    saveProfileFields({ location: locationLabelDraft.trim() === '' ? null : next });
  }

  async function handleUseCurrentLocation() {
    setLocationError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission denied. You can still save the label above.');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({});
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      saveProfileFields({
        location: {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: locationLabelDraft,
          timezone,
        },
      });
    } catch (err: any) {
      setLocationError(err.message ?? 'Failed to read current location.');
    }
  }
```

- [ ] **Step 2: render the four new sections**

In the `return`'s `ScrollView`, add the following just before the closing
`<HealthKitSection .../>` call from Task 8 (i.e. insert between the Pains
section's closing and the `HealthKitSection` element):

```tsx
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Training Frequency</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, profile.training_frequency_mode === 'auto' && styles.modeButtonActive]}
            onPress={() => handleSetTrainingFrequencyMode('auto')}
          >
            <Text style={profile.training_frequency_mode === 'auto' ? styles.modeTextActive : styles.modeText}>
              Auto
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, profile.training_frequency_mode === 'manual' && styles.modeButtonActive]}
            onPress={() => handleSetTrainingFrequencyMode('manual')}
          >
            <Text style={profile.training_frequency_mode === 'manual' ? styles.modeTextActive : styles.modeText}>
              Manual
            </Text>
          </Pressable>
        </View>
        {profile.training_frequency_mode === 'manual' && (
          <>
            <Text style={sharedStyles.helperText}>Target sessions per week</Text>
            {Object.keys(frequencyTargetsDraft).map((key) => (
              <View key={key} style={styles.targetRow}>
                <Text style={sharedStyles.body as any}>{key}</Text>
                <TextInput
                  style={[sharedStyles.textInput, styles.targetInput]}
                  keyboardType="number-pad"
                  value={frequencyTargetsDraft[key]}
                  onChangeText={(text) =>
                    setFrequencyTargetsDraft((prev) => ({ ...prev, [key]: text }))
                  }
                />
              </View>
            ))}
            <Pressable style={sharedStyles.primaryButton} onPress={handleSaveTrainingFrequencyTargets}>
              <Text style={sharedStyles.primaryButtonText}>Save targets</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Diet</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={dietDraft}
          onChangeText={setDietDraft}
          placeholder="e.g. high protein, South Asian staples"
        />
        <Pressable style={sharedStyles.primaryButton} onPress={handleSaveDiet}>
          <Text style={sharedStyles.primaryButtonText}>Save</Text>
        </Pressable>
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Weight & Birth Date</Text>
        <Text style={sharedStyles.helperText}>Weight (kg)</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={weightDraft}
          onChangeText={setWeightDraft}
          keyboardType="decimal-pad"
        />
        <Text style={sharedStyles.helperText}>Birth date (YYYY-MM-DD)</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={birthDateDraft}
          onChangeText={setBirthDateDraft}
          placeholder="1995-01-01"
        />
        <Pressable
          style={sharedStyles.primaryButton}
          onPress={() => {
            handleSaveWeight();
            handleSaveBirthDate();
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>Save</Text>
        </Pressable>
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Location</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={locationLabelDraft}
          onChangeText={setLocationLabelDraft}
          placeholder="e.g. Austin, TX"
        />
        <Pressable style={sharedStyles.primaryButton} onPress={handleSaveLocationLabel}>
          <Text style={sharedStyles.primaryButtonText}>Save label</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={handleUseCurrentLocation}>
          <Text style={styles.secondaryButtonText}>Use current location</Text>
        </Pressable>
        {locationError && <Text style={sharedStyles.warningText}>{locationError}</Text>}
      </View>
```

- [ ] **Step 3: add the new local `styles`**

Add a `StyleSheet.create` block at the bottom of the file (this file had no
local `styles` before this task — Task 8's components all use
`sharedStyles` directly):

```tsx
const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  modeButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  modeText: {
    color: COLORS.ink,
  },
  modeTextActive: {
    color: COLORS.card,
    fontWeight: '600',
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetInput: {
    width: 80,
    textAlign: 'right',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  secondaryButtonText: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
```

- [ ] **Step 4: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: all `lib/*.test.ts` still
pass. Run `npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile —
this is the primary check for this task, since `expo-location`'s types
(`Location.requestForegroundPermissionsAsync`,
`Location.getCurrentPositionAsync`) must resolve correctly against the
version Task 7 installed.

- [ ] **Step 5: commit**

```bash
git add "apps/mobile/app/(tabs)/settings.tsx"
git commit -m "feat: add Training Frequency, Diet, Weight/Birth Date, and Location sections to Settings"
```

---

### Task 10: Manual verification — Settings screen renders and saves, HealthKit permissions expand correctly

**Files:** None (verification only — no source changes).

**Interfaces:**
- Consumes: every file from Tasks 1-9.
- Produces: confidence the full Phase 4 acceptance bar is met — this
  project has no RN component-render test harness, so this manual pass is
  the real verification step for UI work, matching how the mobile-nav
  phase's Task 6 verified its own UI-shell work.

- [ ] **Step 1: full static verification**

From `apps/mobile/`, run:

```bash
npm test
npx tsc --noEmit
npx expo-doctor
```

Expected: Jest suite fully green (including Task 2's new
`healthkitMapping` tests), `tsc` clean, `expo-doctor` reports no
version-mismatch warnings for the newly-added `expo-location` dependency
against the installed Expo SDK 56.

- [ ] **Step 2: bundle check**

```bash
npx expo export --platform ios
```

Expected: the JS bundle builds without a runtime/bundler error — confirms
no import errors across `settings.tsx`, the three new `components/*.tsx`
files, `lib/theme.ts`, and the expanded `healthkitSync.ts`.

- [ ] **Step 3: start the dev server and manually exercise the Settings screen**

```bash
npx expo start --clear
```

Open the app, sign in, navigate to the Settings tab. Expected, in order:

1. A brief "Loading settings…" state, then the full screen renders with
   all 9 sections (Preferred Split, Activities, Goals, Pains,
   Training Frequency, Diet, Weight & Birth Date, Location, HealthKit) in
   the calm/minimal card style (off-white background, white rounded
   cards, muted-green accent).
2. Tap "Change" under Preferred Split — a modal sheet lists all 4
   `split_taxonomy` rows; picking one closes the sheet and the chip updates
   immediately (confirm via a second app reload that the choice persisted).
3. Tap "+ Add" under Activities — the modal groups options under
   "Strength"/"Cardio"/"Recovery" headers; `walking` should already appear
   as a pre-added chip for a fresh profile (confirm against the actual
   profile row's `activities` array — if testing against Sohan's existing
   row, it may already have a non-default array, which is expected and not
   a bug).
4. Add a 4th goal after 3 are already selected — confirm the inline warning
   text appears and no 4th chip is added.
5. Pick a body part under Pains — confirm a `PainEntryRow` appears
   expanded with severity buttons 1-10 and a note field; tap a severity
   number and type a note; reload the app and confirm both persisted.
6. Toggle Training Frequency to "Manual" — confirm one numeric input
   appears per current activity/split-day-label; enter values and tap
   "Save targets"; reload and confirm `training_frequency_manual` round-
   trips.
7. Edit Diet/Weight/Birth Date/Location fields and tap each section's Save
   button — confirm each persists across a reload, and confirm typing
   alone (no Save tap) does not trigger a network write (check Metro logs
   for unexpected Supabase calls).
8. Toggle the HealthKit switch — confirm `healthkit_sync_enabled` flips
   immediately (reload to confirm persistence) and the "what we read" list
   renders below it.

- [ ] **Step 4: confirm the expanded HealthKit permission set (requires a physical iPhone — see note)**

This step's permission-prompt behavior cannot be exercised in Expo Go or
the iOS Simulator (no HealthKit store in the Simulator, consistent with
the original HealthKit-sync phase's testing plan) — it requires the same
Custom Dev Client / EAS build constraint already documented in
`docs/superpowers/specs/2026-06-22-healthkit-sync-design.md`. On a real
device with a Dev Client build that includes this phase's code: open the
app, confirm the iOS HealthKit permission sheet now lists Sleep Analysis,
Heart Rate, and Resting Heart Rate as newly-requested read categories
alongside the four already-granted ones from the prior phase (a user who
already granted the original four will see iOS prompt again only for the
three new categories, per HealthKit's per-category grant model). Confirm
in Supabase that `activity.total_calories`/`activity.steps` are non-null
for at least one synced day after this device test (previously always
null per the original phase's Decision 5 table).

- [ ] **Step 5: record the result**

No commit for this task (verification only). If any step fails, return to
the relevant earlier task and fix it, re-running that task's own "confirm
nothing else broke" step before re-attempting this task.
