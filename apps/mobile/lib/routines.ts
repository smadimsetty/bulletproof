// apps/mobile/lib/routines.ts
//
// Routines (reusable workout templates) in folders. Pure helpers
// (routineFromWorkout, routineDiffers, mergeRoutineUpdate, routineTargetText)
// carry the decisions; the async functions only read/write rows.
import { supabase } from './supabase';
import { addExercisesToWorkout, discardWorkout, startWorkout, type NewWorkoutExercise, type StartResult, type Workout } from './workouts';

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseType: string | null;
  unilateral: boolean;
  position: number;
  targetSets: number;
  targetReps: number | null;
  targetDurationS: number | null;
  targetWeightKg: number | null;
  restS: number | null;
  notes: string | null;
}

export type RoutineExerciseInput = Omit<RoutineExercise, 'id' | 'exerciseName' | 'exerciseType' | 'unilateral'>;

export interface Routine {
  id: string;
  folderId: string | null;
  title: string;
  notes: string | null;
  position: number;
  exercises: RoutineExercise[];
}

export interface RoutineFolder {
  id: string;
  name: string;
  position: number;
}

export interface SaveRoutineInput {
  id?: string;
  folderId: string | null;
  title: string;
  notes: string | null;
  exercises: RoutineExerciseInput[];
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---- pure helpers --------------------------------------------------------

/** Completed working sets only: warm-ups and unfinished rows don't define a routine. */
function completedWorking(sets: Workout['exercises'][number]['sets']) {
  return sets.filter((s) => s.completedAt != null && s.setType === 'working');
}

export function routineFromWorkout(w: Workout): { title: string; notes: string | null; exercises: RoutineExerciseInput[] } {
  const exercises: RoutineExerciseInput[] = [];
  for (const we of [...w.exercises].sort((a, b) => a.position - b.position)) {
    const done = completedWorking(we.sets);
    if (done.length === 0) continue;
    // A sided set number has an L and an R row but is still one set.
    const targetSets = new Set(done.map((s) => s.setNumber)).size;
    const last = done[done.length - 1];
    exercises.push({
      exerciseId: we.exerciseId,
      position: exercises.length + 1,
      targetSets,
      targetReps: last.reps,
      targetDurationS: last.durationS,
      targetWeightKg: last.weightKg,
      restS: null,
      notes: null,
    });
  }
  return { title: w.title, notes: null, exercises };
}

/**
 * True iff the exercise order or any exercise's set count differs. Set
 * *values* (reps/weight/time) changing is the normal case of progressing and
 * must not nag the user to update the routine.
 */
export function routineDiffers(r: Routine, w: Workout): boolean {
  const next = routineFromWorkout(w).exercises;
  const current = [...r.exercises].sort((a, b) => a.position - b.position);
  if (current.length !== next.length) return true;
  return current.some((c, i) => c.exerciseId !== next[i].exerciseId || c.targetSets !== next[i].targetSets);
}

/**
 * The save payload for "Update routine": structure from the workout, but
 * rest / notes (and the header) kept from the existing routine for exercises
 * that still exist in it.
 */
export function mergeRoutineUpdate(r: Routine, w: Workout): SaveRoutineInput {
  const fromWorkout = routineFromWorkout(w);
  const pool = [...r.exercises].sort((a, b) => a.position - b.position);
  const exercises = fromWorkout.exercises.map((e) => {
    const idx = pool.findIndex((p) => p.exerciseId === e.exerciseId);
    if (idx === -1) return e;
    const [match] = pool.splice(idx, 1);
    return { ...e, restS: match.restS, notes: match.notes };
  });
  return { id: r.id, folderId: r.folderId, title: r.title, notes: r.notes, exercises };
}

/** "3 × 10", "2 × 45s", "3 × 10 @ 40 kg"; null when there is no target. */
export function routineTargetText(e: Pick<RoutineExercise, 'targetSets' | 'targetReps' | 'targetDurationS' | 'targetWeightKg'>): string | null {
  const what = e.targetReps != null ? `${e.targetReps}` : e.targetDurationS != null ? `${e.targetDurationS}s` : null;
  if (!what) return `${e.targetSets} sets`;
  const weight = e.targetWeightKg != null && e.targetReps != null ? ` @ ${Math.round(e.targetWeightKg * 100) / 100} kg` : '';
  return `${e.targetSets} × ${what}${weight}`;
}

// ---- reads ---------------------------------------------------------------

const ROUTINE_SELECT = `id, folder_id, title, notes, position,
  routine_exercises ( id, exercise_id, position, target_sets, target_reps, target_duration_s, target_weight_kg, rest_s, notes,
    exercises!routine_exercises_exercise_id_fkey ( name, exercise_type, unilateral ) )`;

function toRoutine(r: any): Routine {
  return {
    id: r.id,
    folderId: r.folder_id ?? null,
    title: r.title,
    notes: r.notes ?? null,
    position: r.position,
    exercises: ((r.routine_exercises ?? []) as any[])
      .map(
        (e): RoutineExercise => ({
          id: e.id,
          exerciseId: e.exercise_id,
          exerciseName: e.exercises?.name ?? 'Unknown exercise',
          exerciseType: e.exercises?.exercise_type ?? null,
          unilateral: !!e.exercises?.unilateral,
          position: e.position,
          targetSets: e.target_sets,
          targetReps: e.target_reps ?? null,
          targetDurationS: e.target_duration_s ?? null,
          targetWeightKg: e.target_weight_kg == null ? null : Number(e.target_weight_kg),
          restS: e.rest_s ?? null,
          notes: e.notes ?? null,
        })
      )
      .sort((a, b) => a.position - b.position),
  };
}

export async function fetchRoutinesAndFolders(): Promise<{ folders: RoutineFolder[]; routines: Routine[] }> {
  const [foldersRes, routinesRes] = await Promise.all([
    supabase.from('routine_folders').select('id, name, position').order('position').order('created_at'),
    supabase.from('routines').select(ROUTINE_SELECT).order('position').order('created_at', { ascending: false }),
  ]);
  check(foldersRes.error);
  check(routinesRes.error);
  return {
    folders: ((foldersRes.data ?? []) as any[]).map((f) => ({ id: f.id, name: f.name, position: f.position })),
    routines: ((routinesRes.data ?? []) as any[]).map(toRoutine),
  };
}

export async function fetchRoutine(id: string): Promise<Routine | null> {
  const { data, error } = await supabase.from('routines').select(ROUTINE_SELECT).eq('id', id).maybeSingle();
  check(error);
  return data ? toRoutine(data) : null;
}

// ---- writes --------------------------------------------------------------

export async function createFolder(name: string): Promise<string> {
  const { data, error } = await supabase.from('routine_folders').insert({ name: name.trim() }).select('id').single();
  check(error);
  return (data as any).id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('routine_folders').update({ name: name.trim() }).eq('id', id);
  check(error);
}

/** Routines inside move to Unfiled (routines.folder_id is ON DELETE SET NULL). */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('routine_folders').delete().eq('id', id);
  check(error);
}

export async function moveFolder(id: string, position: number): Promise<void> {
  const { error } = await supabase.from('routine_folders').update({ position }).eq('id', id);
  check(error);
}

function exerciseRows(routineId: string, exercises: readonly RoutineExerciseInput[]) {
  return exercises.map((e, i) => ({
    routine_id: routineId,
    exercise_id: e.exerciseId,
    position: i + 1,
    target_sets: e.targetSets,
    target_reps: e.targetReps,
    target_duration_s: e.targetDurationS,
    target_weight_kg: e.targetWeightKg,
    rest_s: e.restS,
    notes: e.notes,
  }));
}

export async function saveRoutine(input: SaveRoutineInput): Promise<string> {
  const header = { folder_id: input.folderId, title: input.title.trim(), notes: input.notes?.trim() || null };
  let routineId = input.id;
  let oldChildIds: string[] = [];

  if (routineId) {
    const { data: old, error: oldError } = await supabase.from('routine_exercises').select('id').eq('routine_id', routineId);
    check(oldError);
    oldChildIds = ((old ?? []) as any[]).map((r) => r.id);
    const { error } = await supabase
      .from('routines')
      .update({ ...header, updated_at: new Date().toISOString() })
      .eq('id', routineId);
    check(error);
  } else {
    const { data, error } = await supabase.from('routines').insert(header).select('id').single();
    check(error);
    routineId = (data as any).id as string;
  }

  // Insert the new children before removing the old ones: a failed insert
  // then leaves the previous version intact instead of an emptied routine.
  if (input.exercises.length > 0) {
    const { error } = await supabase.from('routine_exercises').insert(exerciseRows(routineId!, input.exercises));
    check(error);
  }
  if (oldChildIds.length > 0) {
    const { error } = await supabase.from('routine_exercises').delete().in('id', oldChildIds);
    check(error);
  }
  return routineId!;
}

export async function deleteRoutine(id: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  check(error);
}

export async function moveRoutine(id: string, folderId: string | null): Promise<void> {
  const { error } = await supabase.from('routines').update({ folder_id: folderId }).eq('id', id);
  check(error);
}

/**
 * Starts a workout from a routine. Exercises that no longer exist (or are no
 * longer readable) are skipped and reported by name; never a set row for a
 * missing exercise.
 */
export async function startRoutineWorkout(routine: Routine): Promise<StartResult> {
  const result = await startWorkout({ source: 'routine', title: routine.title, routineId: routine.id });
  if (!result.ok) return result;

  try {
    const ids = Array.from(new Set(routine.exercises.map((e) => e.exerciseId)));
    const { data, error } = await supabase.from('exercises').select('id').in('id', ids);
    check(error);
    const present = new Set(((data ?? []) as any[]).map((r) => r.id as string));
    const ordered = [...routine.exercises].sort((a, b) => a.position - b.position);
    const usable = ordered.filter((e) => present.has(e.exerciseId));
    const skipped = ordered.filter((e) => !present.has(e.exerciseId)).map((e) => e.exerciseName);
    if (usable.length === 0) throw new Error('None of this routine’s exercises are available any more.');

    const specs: NewWorkoutExercise[] = usable.map((e) => ({
      exerciseId: e.exerciseId,
      sprintDayExerciseId: null,
      targetText: routineTargetText(e),
      prescribedSets: e.targetSets,
      targetValues: { reps: e.targetReps, weightKg: e.targetWeightKg, durationS: e.targetDurationS },
    }));
    await addExercisesToWorkout(result.workoutId, specs);
    return skipped.length > 0 ? { ...result, skipped } : result;
  } catch (err) {
    // An empty workout would be a dead end and block the next start.
    await discardWorkout(result.workoutId).catch(() => undefined);
    throw err;
  }
}
