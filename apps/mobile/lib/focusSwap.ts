// apps/mobile/lib/focusSwap.ts
//
// "Change today's focus": do a different pain point's routine just for today.
// The routine is built from the other pain point's template for the sprint's
// current day number, using the same slot/tier/least-recently-used rules as
// sprint materialisation. It starts as an ordinary workout with no sprint-day
// link, so saving it never completes the sprint day.
import { supabase } from './supabase';
import type { EquipmentTier } from './equipmentTiers';
import { fetchLastCompletedByExerciseId } from './sprintLifecycle';
import { fetchUserSettings } from './userSettings';
import {
  filterCandidatesByTier,
  pickExerciseForSlot,
  slotsForDay,
  type TemplateRow,
} from './sprintExercisePicker';
import { addExercisesToWorkout, startWorkout, type StartResult } from './workouts';
import { sprintTargetText } from './workoutTitles';

export interface OneOffPoolRow {
  readonly slotKey: string;
  readonly exerciseId: string;
  readonly defaultRank: number;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
  readonly equipment: readonly string[] | null;
}

export interface OneOffExercise {
  readonly exerciseId: string;
  readonly sets: number | null;
  readonly repsOrDuration: string | null;
}

/** One exercise per slot of `dayNumber`, in slot_order. Slots with no candidates are skipped. */
export function pickOneOffSlots(
  template: readonly TemplateRow[],
  pool: readonly OneOffPoolRow[],
  dayNumber: number,
  tier: EquipmentTier | null,
  lastCompleted: ReadonlyMap<string, string>
): OneOffExercise[] {
  const slots = [...slotsForDay(template, dayNumber)].sort((a, b) => a.slotOrder - b.slotOrder);
  const result: OneOffExercise[] = [];
  for (const slot of slots) {
    const inSlot = pool.filter((p) => p.slotKey === slot.slotKey);
    if (inSlot.length === 0) continue;
    const candidates = filterCandidatesByTier(
      inSlot.map((p) => ({ exerciseId: p.exerciseId, defaultRank: p.defaultRank, equipment: p.equipment })),
      tier
    );
    const chosenId = pickExerciseForSlot(candidates, lastCompleted);
    const row = inSlot.find((p) => p.exerciseId === chosenId);
    result.push({
      exerciseId: chosenId,
      sets: row?.prescribedSets ?? null,
      repsOrDuration: row?.prescribedRepsOrDuration ?? null,
    });
  }
  return result;
}

export async function buildOneOffExercises(
  painPointId: string,
  dayNumber: number,
  tier: EquipmentTier | null
): Promise<OneOffExercise[]> {
  const { data: templateRows, error: templateError } = await supabase
    .from('sprint_day_template')
    .select('day_number, slot_key, tier, slot_order')
    .eq('pain_point_id', painPointId);
  if (templateError) throw new Error(templateError.message);

  const { data: poolRows, error: poolError } = await supabase
    .from('sprint_exercise_pool')
    .select('slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration, exercises!sprint_exercise_pool_exercise_id_fkey ( equipment_needed )')
    .eq('pain_point_id', painPointId);
  if (poolError) throw new Error(poolError.message);

  const template: TemplateRow[] = ((templateRows ?? []) as any[]).map((r) => ({
    dayNumber: r.day_number,
    slotKey: r.slot_key,
    tier: r.tier,
    slotOrder: r.slot_order,
  }));
  const pool: OneOffPoolRow[] = ((poolRows ?? []) as any[]).map((r) => ({
    slotKey: r.slot_key,
    exerciseId: r.exercise_id,
    defaultRank: r.default_rank,
    prescribedSets: r.prescribed_sets,
    prescribedRepsOrDuration: r.prescribed_reps_or_duration,
    equipment: (r.exercises?.equipment_needed ?? null) as string[] | null,
  }));

  const lastCompleted = await fetchLastCompletedByExerciseId(painPointId);
  return pickOneOffSlots(template, pool, dayNumber, tier, lastCompleted);
}

/**
 * Builds and starts the one-off workout. Never passes a sprint-day id, so
 * finishing it leaves the sprint day open.
 */
export async function startOneOffWorkout(
  painPointId: string,
  painPointName: string,
  dayNumber: number
): Promise<StartResult> {
  const tier = (await fetchUserSettings().catch(() => null))?.equipmentTier ?? null;
  const exercises = await buildOneOffExercises(painPointId, dayNumber, tier);
  if (exercises.length === 0) throw new Error('No routine is available for that pain point yet.');

  const result = await startWorkout({ source: 'empty', title: `${painPointName} (one-off)` });
  if (!result.ok) return result;
  try {
    await addExercisesToWorkout(
      result.workoutId,
      exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sprintDayExerciseId: null,
        targetText: sprintTargetText(e.sets, e.repsOrDuration),
        prescribedSets: e.sets,
      }))
    );
  } catch (err) {
    await supabase.from('workouts').delete().eq('id', result.workoutId);
    throw err;
  }
  return result;
}
