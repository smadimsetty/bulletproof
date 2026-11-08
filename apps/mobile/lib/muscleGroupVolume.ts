// Weekly training-volume aggregation and best-lift ranking for the
// Trends screen's muscle-group bar chart and its tap-to-drill-down list.
// See design spec Decisions 4 and 5.
import { supabase } from './supabase';
import { isoWeekStart, type DateRangeBounds } from './trendsRange';

export interface MuscleGroupLogRow {
  readonly date: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly bodyParts: readonly string[];
  readonly isComplex: boolean;
  readonly repsCompleted: number | null;
  readonly weightKg: number | null;
}

export interface WeeklyVolumePoint {
  readonly weekStart: string;
  readonly bodyPart: string;
  readonly volume: number;
}

export interface BestLiftEntry {
  readonly date: string;
  readonly exerciseName: string;
  readonly weightKg: number | null;
  readonly repsCompleted: number | null;
  readonly estimatedOneRepMax: number;
}

interface RawMuscleGroupLogRow {
  date: string;
  exercise_id: string;
  reps_completed: number | null;
  weight_kg: number | null;
  exercises: { name: string; body_parts: string[]; is_complex: boolean } | null;
}

/**
 * Epley's formula for complex (multi-joint) lifts with both reps and
 * weight logged; otherwise just the raw weight (isolation lifts, or a
 * complex lift logged with no rep count). null when there's no weight
 * at all -- a bodyweight set has nothing to rank against a loaded lift.
 */
export function estimateOneRepMax(row: MuscleGroupLogRow): number | null {
  if (row.weightKg == null) {
    return null;
  }
  if (row.isComplex && row.repsCompleted != null) {
    return row.weightKg * (1 + row.repsCompleted / 30);
  }
  return row.weightKg;
}

/**
 * Volume = reps * weight when weight is logged, reps alone for
 * bodyweight sets, 0 when neither reps nor weight were logged (e.g. a
 * mobility checklist completion with no set concept) -- it still
 * occupies its body part's bucket key, just contributes nothing.
 */
function rowVolume(row: MuscleGroupLogRow): number {
  const reps = row.repsCompleted ?? 0;
  return row.weightKg != null ? reps * row.weightKg : reps;
}

const BUCKET_KEY_DELIMITER = '::';

export function aggregateWeeklyVolumeByBodyPart(rows: readonly MuscleGroupLogRow[]): WeeklyVolumePoint[] {
  const buckets = new Map<string, number>();

  for (const row of rows) {
    const weekStart = isoWeekStart(row.date);
    const volume = rowVolume(row);
    for (const bodyPart of row.bodyParts) {
      const key = `${weekStart}${BUCKET_KEY_DELIMITER}${bodyPart}`;
      buckets.set(key, (buckets.get(key) ?? 0) + volume);
    }
  }

  return [...buckets.entries()].map(([key, volume]) => {
    const [weekStart, bodyPart] = key.split(BUCKET_KEY_DELIMITER);
    return { weekStart, bodyPart, volume };
  });
}

export interface BodyPartVolumeTotal {
  readonly bodyPart: string;
  readonly volume: number;
}

/**
 * Collapses the weekly buckets into one total per body part across the
 * whole selected range, sorted descending -- this is what the volume bar
 * chart actually renders (one bar per muscle group, design spec
 * Decision 4's addendum: the weekly buckets exist for aggregation
 * accuracy/future per-week breakdowns, but each bar in the current chart
 * is a range total, not a single week, since a bar must map 1:1 to a
 * drill-down target and a week can span many muscle groups).
 */
export function totalVolumeByBodyPart(weeklyVolume: readonly WeeklyVolumePoint[]): BodyPartVolumeTotal[] {
  const totals = new Map<string, number>();
  for (const point of weeklyVolume) {
    totals.set(point.bodyPart, (totals.get(point.bodyPart) ?? 0) + point.volume);
  }
  return [...totals.entries()]
    .map(([bodyPart, volume]) => ({ bodyPart, volume }))
    .sort((a, b) => b.volume - a.volume);
}

/**
 * Full sorted list for one body part -- the caller (the drill-down UI)
 * slices the top N and grows the slice on "show more" rather than this
 * function taking a limit, per design spec Decision 5's no-live-re-query
 * call.
 */
export function rankBestLifts(rows: readonly MuscleGroupLogRow[], bodyPart: string): BestLiftEntry[] {
  return rows
    .filter((row) => row.bodyParts.includes(bodyPart))
    .map((row) => ({ row, oneRepMax: estimateOneRepMax(row) }))
    .filter((entry): entry is { row: MuscleGroupLogRow; oneRepMax: number } => entry.oneRepMax != null)
    .sort((a, b) => b.oneRepMax - a.oneRepMax)
    .map(({ row, oneRepMax }) => ({
      date: row.date,
      exerciseName: row.exerciseName,
      weightKg: row.weightKg,
      repsCompleted: row.repsCompleted,
      estimatedOneRepMax: oneRepMax,
    }));
}

export async function fetchMuscleGroupLogs(bounds: DateRangeBounds): Promise<MuscleGroupLogRow[]> {
  const { data, error } = await supabase
    .from('exercise_logs')
    .select('date, exercise_id, reps_completed, weight_kg, exercises!exercise_logs_exercise_id_fkey ( name, body_parts, is_complex )')
    .eq('completed', true)
    .gte('date', bounds.startDate)
    .lte('date', bounds.endDate);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as RawMuscleGroupLogRow[]).map((row) => ({
    date: row.date,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? 'Unknown exercise',
    bodyParts: row.exercises?.body_parts ?? [],
    isComplex: row.exercises?.is_complex ?? false,
    repsCompleted: row.reps_completed,
    weightKg: row.weight_kg,
  }));
}
