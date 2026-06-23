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
