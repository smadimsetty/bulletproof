// apps/mobile/lib/social/copyWorkout.ts
//
// Copy a workout I can read: start it now (source='copy') or save it as a
// routine. Custom exercises owned by someone else are cloned into my library
// first (cloned_from_exercise_id records the origin) and the copy points at
// the clones; a clone made on an earlier copy is reused, not duplicated.
// What gets copied is the source's completed working sets (set count and the
// last set's reps / weight / hold) -- same extraction as "save as routine".
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { fetchWorkout, startWorkout, addExercisesToWorkout, discardWorkout, type NewWorkoutExercise, type StartResult } from '../workouts';
import { routineFromWorkout, routineTargetText, saveRoutine } from '../routines';
import { fetchWeightUnit } from '../userPreferences';
import type { WeightUnit } from '../units';

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const CLONE_COLUMNS =
  'id, name, exercise_type, movement_pattern, unilateral, body_parts, equipment_needed, description, evidence_rationale, demo_video_url, owner_id';

/**
 * Maps each exercise id to the id I should use: itself if it is global or
 * mine, otherwise my clone (created if I have none yet).
 */
export async function resolveExerciseIds(exerciseIds: readonly string[]): Promise<Map<string, string>> {
  const me = await getMyId();
  const unique = Array.from(new Set(exerciseIds));
  const map = new Map<string, string>(unique.map((id) => [id, id]));
  if (unique.length === 0) return map;

  const { data, error } = await supabase.from('exercises').select(CLONE_COLUMNS).in('id', unique);
  check(error);
  const foreign = ((data ?? []) as any[]).filter((e) => e.owner_id && e.owner_id !== me);
  if (foreign.length === 0) return map;

  const { data: existing, error: existingError } = await supabase
    .from('exercises')
    .select('id, cloned_from_exercise_id')
    .eq('owner_id', me)
    .in('cloned_from_exercise_id', foreign.map((e) => e.id));
  check(existingError);
  const cloneOf = new Map(((existing ?? []) as any[]).map((r) => [r.cloned_from_exercise_id as string, r.id as string]));

  for (const e of foreign) {
    const reuse = cloneOf.get(e.id);
    if (reuse) {
      map.set(e.id, reuse);
      continue;
    }
    const { data: created, error: createError } = await supabase
      .from('exercises')
      .insert({
        name: e.name,
        exercise_type: e.exercise_type,
        movement_pattern: e.movement_pattern,
        unilateral: e.unilateral,
        body_parts: e.body_parts,
        equipment_needed: e.equipment_needed,
        description: e.description ?? e.evidence_rationale ?? null,
        demo_video_url: e.demo_video_url,
        owner_id: me,
        cloned_from_exercise_id: e.id,
      })
      .select('id')
      .single();
    check(createError);
    map.set(e.id, (created as any).id);
  }
  return map;
}

export type CopyResult =
  | { kind: 'started'; workoutId: string }
  | { kind: 'in_progress'; activeWorkoutId: string | null }
  | { kind: 'routine'; routineId: string };

export async function copyWorkout(workoutId: string, mode: 'start' | 'routine'): Promise<CopyResult> {
  const source = await fetchWorkout(workoutId);
  const draft = routineFromWorkout(source);
  if (draft.exercises.length === 0) throw new Error('This workout has no completed sets to copy.');

  const idMap = await resolveExerciseIds(draft.exercises.map((e) => e.exerciseId));
  const exercises = draft.exercises.map((e) => ({ ...e, exerciseId: idMap.get(e.exerciseId) ?? e.exerciseId }));

  if (mode === 'routine') {
    const routineId = await saveRoutine({ folderId: null, title: draft.title, notes: draft.notes, exercises });
    return { kind: 'routine', routineId };
  }

  const unit = await fetchWeightUnit().catch((): WeightUnit => 'lbs');
  const result: StartResult = await startWorkout({
    source: 'copy',
    title: source.title,
    copiedFromWorkoutId: source.id,
  });
  if (!result.ok) return { kind: 'in_progress', activeWorkoutId: result.activeWorkoutId };

  try {
    const specs: NewWorkoutExercise[] = exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sprintDayExerciseId: null,
      targetText: routineTargetText(e, unit),
      prescribedSets: e.targetSets,
      targetValues: { reps: e.targetReps, weightKg: e.targetWeightKg, durationS: e.targetDurationS },
    }));
    await addExercisesToWorkout(result.workoutId, specs);
    return { kind: 'started', workoutId: result.workoutId };
  } catch (err) {
    // An empty workout would be a dead end and block the next start.
    await discardWorkout(result.workoutId).catch(() => undefined);
    throw err;
  }
}
