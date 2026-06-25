// apps/mobile/lib/healthkitMapping.ts
//
// Pure row-mapping logic from HealthKit workout samples to the `activity`
// table's shape. Mirrors prototyping/weight-tuning/oura_pull.py's
// to_activity_row field-for-field (same `workouts` jsonb inner shape),
// with HealthKit's fields substituted for Oura's. See
// docs/superpowers/specs/2026-06-22-healthkit-sync-design.md Decision 5
// for the full field-mapping rationale.

export interface MinimalWorkoutSample {
  readonly uuid: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly workoutActivityTypeName: string;
  readonly totalEnergyBurnedKcal: number | null;
  readonly totalDistanceMeters: number | null;
}

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

export interface ActivityWorkoutEntry {
  activity: string;
  intensity: null;
  calories: number | null;
  distance: number | null;
  start_datetime: string;
  end_datetime: string;
  source: 'healthkit';
}

export interface ActivityRow {
  date: string;
  activity_score: null;
  total_calories: null;
  active_calories: null;
  steps: null;
  high_activity_time: null;
  medium_activity_time: null;
  low_activity_time: null;
  sedentary_time: null;
  workout_count: number;
  workouts: ActivityWorkoutEntry[];
}

/**
 * Local calendar date (YYYY-MM-DD) a workout's start time falls on, in the
 * device's current timezone -- matches Postgres `date` column semantics
 * (a single day, not a UTC-anchored instant).
 */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Groups workout samples by the local calendar date of their start time.
 */
export function groupWorkoutsByLocalDate(
  samples: readonly MinimalWorkoutSample[]
): Map<string, MinimalWorkoutSample[]> {
  const grouped = new Map<string, MinimalWorkoutSample[]>();
  for (const sample of samples) {
    const day = localDateString(sample.startDate);
    const existing = grouped.get(day);
    if (existing) {
      existing.push(sample);
    } else {
      grouped.set(day, [sample]);
    }
  }
  return grouped;
}

/**
 * Maps a single workout sample to the `workouts` jsonb array's inner shape.
 */
function toWorkoutEntry(sample: MinimalWorkoutSample): ActivityWorkoutEntry {
  return {
    activity: sample.workoutActivityTypeName,
    intensity: null,
    calories: sample.totalEnergyBurnedKcal,
    distance: sample.totalDistanceMeters,
    start_datetime: sample.startDate.toISOString(),
    end_datetime: sample.endDate.toISOString(),
    source: 'healthkit',
  };
}

/**
 * Maps grouped-by-date workout samples into `activity`-table-shaped rows,
 * one per date. Day-level aggregate columns (activity_score,
 * total_calories, steps, etc.) are null -- this phase only queries
 * workout samples, not the day-level quantity types (see design spec
 * Decision 2).
 */
export function toActivityRows(
  groupedByDate: Map<string, MinimalWorkoutSample[]>
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const [date, samples] of groupedByDate) {
    rows.push({
      date,
      activity_score: null,
      total_calories: null,
      active_calories: null,
      steps: null,
      high_activity_time: null,
      medium_activity_time: null,
      low_activity_time: null,
      sedentary_time: null,
      workout_count: samples.length,
      workouts: samples.map(toWorkoutEntry),
    });
  }
  return rows;
}

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
