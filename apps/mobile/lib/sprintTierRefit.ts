// apps/mobile/lib/sprintTierRefit.ts
//
// Sprint days are materialised up front (all 14 at activation), so changing
// the equipment tier used to have no effect on the sprint already running.
// After a tier change, every not-yet-done exercise on today or a later day
// that the new tier no longer allows is re-picked from the same slot with the
// same least-recently-used rules. Exercises the tier still allows are left
// alone (moving up a tier never shuffles a plan the user already has).
//
// Days are skipped when they are completed, in the past, or already have a
// workout started from them (the logger copied that day's exercises, so
// changing the plan underneath it would make the two disagree).
import { supabase } from './supabase';
import { localDateString } from './localDate';
import { requiredTier, tierAllows, type EquipmentTier } from './equipmentTiers';
import { filterCandidatesByTier, pickExerciseForSlot } from './sprintExercisePicker';
import { fetchInFlightSprint, fetchLastCompletedByExerciseId } from './sprintLifecycle';

export interface RefitDayExercise {
  readonly id: string;
  readonly slotKey: string;
  readonly exerciseId: string;
  readonly equipment: readonly string[] | null;
  readonly completed: boolean;
}

export interface RefitDay {
  readonly id: string;
  readonly exercises: readonly RefitDayExercise[];
}

export interface RefitPoolRow {
  readonly slotKey: string;
  readonly exerciseId: string;
  readonly defaultRank: number;
  readonly equipment: readonly string[] | null;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
}

export interface RefitChange {
  readonly sprintDayExerciseId: string;
  readonly fromExerciseId: string;
  readonly toExerciseId: string;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
}

/** Pure: which rows to change, and to what. A null tier allows everything, so nothing changes. */
export function planTierRefit(
  days: readonly RefitDay[],
  pool: readonly RefitPoolRow[],
  tier: EquipmentTier | null,
  lastCompleted: ReadonlyMap<string, string>
): RefitChange[] {
  if (tier == null) return [];
  const changes: RefitChange[] = [];
  for (const day of days) {
    const inDay = new Set(day.exercises.map((e) => e.exerciseId));
    for (const ex of day.exercises) {
      if (ex.completed || tierAllows(tier, requiredTier(ex.equipment))) continue;
      const allowed = pool
        .filter((p) => p.slotKey === ex.slotKey)
        .filter((p) => tierAllows(tier, requiredTier(p.equipment)));
      if (allowed.length === 0) continue; // nothing better exists for this slot; keep what's there
      const others = new Set(inDay);
      others.delete(ex.exerciseId);
      const chosenId = pickExerciseForSlot(filterCandidatesByTier(allowed, tier), lastCompleted, others);
      const row = allowed.find((p) => p.exerciseId === chosenId)!;
      inDay.delete(ex.exerciseId);
      inDay.add(chosenId);
      changes.push({
        sprintDayExerciseId: ex.id,
        fromExerciseId: ex.exerciseId,
        toExerciseId: chosenId,
        prescribedSets: row.prescribedSets,
        prescribedRepsOrDuration: row.prescribedRepsOrDuration,
      });
    }
  }
  return changes;
}

/**
 * Re-fit the in-flight sprint (if any) to `tier`. Returns how many exercises
 * changed. Only an 'active' sprint has days to refit; a sprint still waiting
 * on its baseline picks up the tier when it activates.
 */
export async function refitInFlightSprintToTier(tier: EquipmentTier | null, now: Date = new Date()): Promise<number> {
  if (tier == null) return 0;
  const sprint = await fetchInFlightSprint();
  if (!sprint || sprint.status !== 'active') return 0;

  const { data: dayRows, error: daysError } = await supabase
    .from('sprint_days')
    .select('id, sprint_day_exercises ( id, slot_key, exercise_id, completed_at, exercises!sprint_day_exercises_exercise_id_fkey ( equipment_needed ) )')
    .eq('sprint_id', sprint.id)
    .is('completed_at', null)
    .gte('date', localDateString(now));
  if (daysError) throw new Error(daysError.message);
  const rows = (dayRows ?? []) as any[];
  if (rows.length === 0) return 0;

  const { data: started, error: startedError } = await supabase
    .from('workouts')
    .select('sprint_day_id')
    .in('sprint_day_id', rows.map((d) => d.id));
  if (startedError) throw new Error(startedError.message);
  const startedDayIds = new Set(((started ?? []) as any[]).map((w) => w.sprint_day_id));

  const days: RefitDay[] = rows
    .filter((d) => !startedDayIds.has(d.id))
    .map((d) => ({
      id: d.id,
      exercises: ((d.sprint_day_exercises ?? []) as any[]).map((e) => ({
        id: e.id,
        slotKey: e.slot_key,
        exerciseId: e.exercise_id,
        equipment: (e.exercises?.equipment_needed ?? null) as string[] | null,
        completed: e.completed_at != null,
      })),
    }));

  const { data: poolRows, error: poolError } = await supabase
    .from('sprint_exercise_pool')
    .select('slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration, exercises!sprint_exercise_pool_exercise_id_fkey ( equipment_needed )')
    .eq('pain_point_id', sprint.painPointId);
  if (poolError) throw new Error(poolError.message);
  const pool: RefitPoolRow[] = ((poolRows ?? []) as any[]).map((p) => ({
    slotKey: p.slot_key,
    exerciseId: p.exercise_id,
    defaultRank: p.default_rank,
    equipment: (p.exercises?.equipment_needed ?? null) as string[] | null,
    prescribedSets: p.prescribed_sets ?? null,
    prescribedRepsOrDuration: p.prescribed_reps_or_duration ?? null,
  }));

  const changes = planTierRefit(days, pool, tier, await fetchLastCompletedByExerciseId(sprint.painPointId));
  for (const c of changes) {
    const { error } = await supabase
      .from('sprint_day_exercises')
      .update({
        exercise_id: c.toExerciseId,
        swapped_from_exercise_id: c.fromExerciseId,
        prescribed_sets: c.prescribedSets,
        prescribed_reps_or_duration: c.prescribedRepsOrDuration,
      })
      .eq('id', c.sprintDayExerciseId);
    if (error) throw new Error(error.message);
  }
  return changes.length;
}
