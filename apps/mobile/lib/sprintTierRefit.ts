// apps/mobile/lib/sprintTierRefit.ts
//
// After an equipment tier change, every not-yet-done exercise on today or a
// later BUILT day that the new tier no longer allows is re-picked on the
// slot's ladder: a same-level alternate the tier allows, else the nearest
// lower level that has one (spec 2026-11-12 §8a.5). Exercises the tier still
// allows are left alone (moving up a tier never shuffles a plan the user
// already has). Days not built yet need nothing: they are built later with
// the new tier.
//
// Days are skipped when they are completed, in the past, or already have a
// workout started from them (the logger copied that day's exercises, so
// changing the plan underneath it would make the two disagree).
import { supabase } from './supabase';
import { localDateString } from './localDate';
import { requiredTier, tierAllows, type EquipmentTier } from './equipmentTiers';
import type { LadderRow } from './engine/dayPlanner';
import { pickAtLevel } from './engine/ladderPick';
import { fetchLadder } from './ladderData';
import { fetchInFlightSprint, fetchLastCompletedByExerciseId } from './sprintLifecycle';

export interface RefitDayExercise {
  readonly id: string;
  readonly slotKey: string;
  readonly exerciseId: string;
  readonly equipment: readonly string[] | null;
  readonly completed: boolean;
  /** Ladder position; null on rows built before the adaptive engine. */
  readonly level: number | null;
  readonly step: number | null;
}

export interface RefitDay {
  readonly id: string;
  readonly exercises: readonly RefitDayExercise[];
}

export interface RefitChange {
  readonly sprintDayExerciseId: string;
  readonly fromExerciseId: string;
  readonly toExerciseId: string;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
  readonly level: number;
  readonly step: number;
}

/** Pure: which rows to change, and to what. A null tier allows everything, so nothing changes. */
export function planLadderRefit(
  days: readonly RefitDay[],
  ladder: readonly LadderRow[],
  tier: EquipmentTier | null,
  lastCompleted: ReadonlyMap<string, string>
): RefitChange[] {
  if (tier == null) return [];
  const changes: RefitChange[] = [];
  for (const day of days) {
    const inDay = new Set(day.exercises.map((e) => e.exerciseId));
    for (const ex of day.exercises) {
      if (ex.completed || tierAllows(tier, requiredTier(ex.equipment))) continue;
      // A pre-engine row has no level: use the lowest level the exercise sits at (else 1).
      const levels = ladder.filter((r) => r.slotKey === ex.slotKey && r.exerciseId === ex.exerciseId).map((r) => r.level);
      const level = ex.level ?? (levels.length ? Math.min(...levels) : 1);
      const choice = pickAtLevel(ladder, {
        slotKey: ex.slotKey, level, step: ex.step ?? 1, tier, exclude: inDay, lastDone: lastCompleted,
      });
      if (!choice) continue; // nothing allowed at or below this level; keep what's there
      inDay.delete(ex.exerciseId);
      inDay.add(choice.exerciseId);
      changes.push({
        sprintDayExerciseId: ex.id,
        fromExerciseId: ex.exerciseId,
        toExerciseId: choice.exerciseId,
        prescribedSets: choice.sets,
        prescribedRepsOrDuration: choice.repsOrDuration,
        level: choice.level,
        step: choice.step,
      });
    }
  }
  return changes;
}

/**
 * Re-fit the in-flight sprint (if any) to `tier`. Returns how many exercises
 * changed. Only an 'active' sprint has days to refit; a sprint still waiting
 * on its baseline picks up the tier when its days are built.
 */
export async function refitInFlightSprintToTier(tier: EquipmentTier | null, now: Date = new Date()): Promise<number> {
  if (tier == null) return 0;
  const sprint = await fetchInFlightSprint();
  if (!sprint || sprint.status !== 'active') return 0;

  const { data: dayRows, error: daysError } = await supabase
    .from('sprint_days')
    .select('id, sprint_day_exercises ( id, slot_key, exercise_id, completed_at, level, step, exercises!sprint_day_exercises_exercise_id_fkey ( equipment_needed ) )')
    .eq('sprint_id', sprint.id)
    .is('completed_at', null)
    .not('built_at', 'is', null)
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
        level: e.level ?? null,
        step: e.step ?? null,
      })),
    }));

  const ladder = await fetchLadder(sprint.painPointId);
  const changes = planLadderRefit(days, ladder, tier, await fetchLastCompletedByExerciseId(sprint.painPointId));
  for (const c of changes) {
    const { error } = await supabase
      .from('sprint_day_exercises')
      .update({
        exercise_id: c.toExerciseId,
        swapped_from_exercise_id: c.fromExerciseId,
        prescribed_sets: c.prescribedSets,
        prescribed_reps_or_duration: c.prescribedRepsOrDuration,
        level: c.level,
        step: c.step,
      })
      .eq('id', c.sprintDayExerciseId);
    if (error) throw new Error(error.message);
  }
  return changes.length;
}
