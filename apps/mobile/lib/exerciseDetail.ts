// apps/mobile/lib/exerciseDetail.ts
//
// Data for the exercise detail screen: static info from `exercises`, and pure
// per-workout "best working set" series over the stats dataset.
import { supabase } from './supabase';
import { getMyId } from './session';
import { fieldsForExercise } from './setFields';
import type { StatsWorkout } from './stats/dataset';

export interface ExerciseInfo {
  id: string;
  name: string;
  exerciseType: string | null;
  unilateral: boolean;
  description: string | null;
  demoVideoUrl: string | null;
  bodyParts: string[];
  equipment: string[];
  /** True for the user's own custom exercises (editable / deletable). */
  isMine: boolean;
}

export async function fetchExerciseInfo(id: string): Promise<ExerciseInfo> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, exercise_type, unilateral, evidence_rationale, description, owner_id, demo_video_url, body_parts, equipment_needed')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  const r = data as any;
  // Friends' custom exercises are readable too (social policies), so "mine"
  // must compare against the signed-in user, not just "has an owner".
  const me = await getMyId().catch(() => null);
  return {
    id: r.id,
    name: r.name,
    exerciseType: r.exercise_type ?? null,
    unilateral: !!r.unilateral,
    description: r.description ?? r.evidence_rationale ?? null,
    demoVideoUrl: r.demo_video_url ?? null,
    bodyParts: r.body_parts ?? [],
    equipment: r.equipment_needed ?? [],
    isMine: !!r.owner_id && r.owner_id === me,
  };
}

export interface MetricPoint {
  /** The workout's endedAt (ISO). */
  date: string;
  left?: number;
  right?: number;
  value?: number;
  unit: string;
}

function maxOf(a: number | undefined, b: number): number {
  return a === undefined ? b : Math.max(a, b);
}

function bestPerWorkout(
  workouts: readonly StatsWorkout[],
  exerciseId: string,
  pick: (ex: StatsWorkout['exercises'][number], set: StatsWorkout['exercises'][number]['sets'][number]) => { v: number | null; unit: string } | null
): MetricPoint[] {
  const out: MetricPoint[] = [];
  for (const w of workouts) {
    let point: MetricPoint | null = null;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const set of ex.sets) {
        if (set.setType !== 'working' || set.completedAt == null) continue;
        const got = pick(ex, set);
        if (!got || got.v == null) continue;
        point = point ?? { date: w.endedAt, unit: got.unit };
        if (set.side === 'left') point.left = maxOf(point.left, got.v);
        else if (set.side === 'right') point.right = maxOf(point.right, got.v);
        else point.value = maxOf(point.value, got.v);
      }
    }
    if (point) out.push(point);
  }
  return out;
}

/** Best working-set value per workout for the exercise's primary metric (oldest first). */
export function metricSeries(workouts: readonly StatsWorkout[], exerciseId: string): MetricPoint[] {
  return bestPerWorkout(workouts, exerciseId, (ex, set) => {
    const { kind } = fieldsForExercise({ exerciseType: ex.exerciseType, unilateral: ex.unilateral });
    if (kind === 'hold' || kind === 'duration') return { v: set.durationS, unit: 's' };
    if (kind === 'reps') return { v: set.reps, unit: 'reps' };
    return { v: set.weightKg, unit: 'kg' };
  });
}

/**
 * Best ROM per workout. Only points sharing the most recent ROM unit are
 * returned, so a chart never mixes cm and degrees.
 */
export function romSeries(workouts: readonly StatsWorkout[], exerciseId: string): MetricPoint[] {
  let latestUnit: string | null = null;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) if (s.romValue != null && s.romUnit) latestUnit = s.romUnit;
    }
  }
  if (!latestUnit) return [];
  return bestPerWorkout(workouts, exerciseId, (_ex, set) =>
    set.romValue != null && set.romUnit === latestUnit ? { v: set.romValue, unit: latestUnit! } : null
  );
}
