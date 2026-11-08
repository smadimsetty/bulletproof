// apps/mobile/lib/workouts.ts
//
// Supabase data layer for the logger + history (spec sections 2, 4, 5, 6).
// Decision logic lives in the pure modules it imports; this file only
// reads/writes rows and emits active-workout change events.
import { supabase } from './supabase';
import { completeExercise, completeDay, submitDayFeedback, type SprintDay } from './sprintLifecycle';
import { defaultSetCount, fieldsForExercise, type RomUnit, type SetValues, type Side } from './setFields';
import { plannedRows, prefillValues, type PreviousSet } from './previousValues';
import { planFinish } from './finishPlan';
import { sprintTargetText, sprintWorkoutTitle } from './workoutTitles';
import type { CatalogExercise } from './exerciseSearch';

export type WorkoutSource = 'empty' | 'sprint';

export interface WorkoutSetRow extends SetValues {
  readonly id: string;
  readonly setNumber: number;
  readonly side: Side;
  readonly setType: 'warmup' | 'working';
  readonly completedAt: string | null;
}

export interface WorkoutExerciseRow {
  readonly id: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly exerciseType: string | null;
  readonly unilateral: boolean;
  readonly description: string | null;
  readonly position: number;
  readonly targetText: string | null;
  readonly measureRom: boolean;
  readonly sprintDayExerciseId: string | null;
  readonly sets: readonly WorkoutSetRow[];
}

export interface Workout {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly source: WorkoutSource;
  readonly sprintDayId: string | null;
  /** The pain point of the sprint this workout belongs to; null for non-sprint workouts. */
  readonly painPointId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly exercises: readonly WorkoutExerciseRow[];
}

export interface ActiveWorkoutSummary {
  readonly id: string;
  readonly title: string;
  readonly startedAt: string;
  readonly sprintDayId: string | null;
}

export interface WorkoutListItem {
  readonly id: string;
  readonly title: string;
  readonly source: WorkoutSource;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly exerciseCount: number;
  readonly setCount: number;
}

export interface NewWorkoutExercise {
  readonly exerciseId: string;
  readonly sprintDayExerciseId: string | null;
  readonly targetText: string | null;
  readonly prescribedSets: number | null;
}

export type StartResult =
  | { readonly ok: true; readonly workoutId: string }
  | { readonly ok: false; readonly reason: 'in_progress'; readonly activeWorkoutId: string | null };

export interface SetPatch {
  readonly reps?: number | null;
  readonly weightKg?: number | null;
  readonly durationS?: number | null;
  readonly romValue?: number | null;
  readonly romUnit?: RomUnit | null;
  readonly setType?: 'warmup' | 'working';
  readonly completedAt?: string | null;
}

export interface FinishInput {
  readonly title: string;
  readonly notes: string;
  readonly reaction: 'good' | 'neutral' | 'hurt' | null;
  readonly reactionNote: string;
}

// ---- change events -------------------------------------------------------

const listeners = new Set<() => void>();

export function subscribeToActiveWorkoutChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyActiveWorkoutChanged(): void {
  listeners.forEach((cb) => cb());
}

// ---- helpers -------------------------------------------------------------

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

type PgError = { code?: string; message?: string; details?: string | null } | null;

/**
 * 23505 on the one-in-progress-per-owner index. workouts.sprint_day_id is
 * UNIQUE too, so a 23505 alone could also mean "this sprint day already has
 * a saved workout" -- which has nothing to resume.
 */
export function isInProgressConflict(error: PgError): boolean {
  if (error?.code !== '23505') return false;
  return `${error.message ?? ''} ${error.details ?? ''}`.includes('workouts_one_in_progress_per_owner');
}

export function buildSprintWorkoutExercises(day: SprintDay): NewWorkoutExercise[] {
  return [...day.exercises]
    .sort((a, b) => a.order - b.order)
    .map((x) => ({
      exerciseId: x.exerciseId,
      sprintDayExerciseId: x.id,
      targetText: sprintTargetText(x.prescribedSets, x.prescribedRepsOrDuration),
      prescribedSets: x.prescribedSets,
    }));
}

const SET_COLUMNS =
  'id, set_number, side, set_type, reps, weight_kg, duration_s, rom_value, rom_unit, completed_at';

function toSetRow(r: any): WorkoutSetRow {
  return {
    id: r.id,
    setNumber: r.set_number,
    side: r.side,
    setType: r.set_type,
    reps: r.reps,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
    durationS: r.duration_s,
    romValue: r.rom_value == null ? null : Number(r.rom_value),
    romUnit: r.rom_unit,
    completedAt: r.completed_at,
  };
}

function sortSets(sets: WorkoutSetRow[]): WorkoutSetRow[] {
  const sideRank = (s: Side) => (s === 'right' ? 1 : 0);
  return sets.sort((a, b) => a.setNumber - b.setNumber || sideRank(a.side) - sideRank(b.side));
}

// ---- reads ---------------------------------------------------------------

const ACTIVE_COLUMNS = 'id, title, started_at, sprint_day_id';

function toActive(r: any): ActiveWorkoutSummary {
  return { id: r.id, title: r.title, startedAt: r.started_at, sprintDayId: r.sprint_day_id };
}

export async function fetchActiveWorkout(): Promise<ActiveWorkoutSummary | null> {
  const { data, error } = await supabase.from('workouts').select(ACTIVE_COLUMNS).is('ended_at', null).maybeSingle();
  check(error);
  return data ? toActive(data) : null;
}

export async function fetchWorkout(workoutId: string): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      `id, title, notes, source, sprint_day_id, started_at, ended_at,
       sprint_days!workouts_sprint_day_id_fkey ( sprints ( pain_point_id ) ),
       workout_exercises ( id, exercise_id, position, target_text, measure_rom, sprint_day_exercise_id,
         exercises!workout_exercises_exercise_id_fkey ( name, exercise_type, unilateral, evidence_rationale ),
         workout_sets ( ${SET_COLUMNS} ) )`
    )
    .eq('id', workoutId)
    .single();
  check(error);
  const w: any = data;
  return {
    id: w.id,
    title: w.title,
    notes: w.notes,
    source: w.source,
    sprintDayId: w.sprint_day_id,
    painPointId: w.sprint_days?.sprints?.pain_point_id ?? null,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    exercises: ((w.workout_exercises ?? []) as any[])
      .map(
        (e): WorkoutExerciseRow => ({
          id: e.id,
          exerciseId: e.exercise_id,
          exerciseName: e.exercises?.name ?? 'Unknown exercise',
          exerciseType: e.exercises?.exercise_type ?? null,
          unilateral: !!e.exercises?.unilateral,
          description: e.exercises?.evidence_rationale ?? null,
          position: e.position,
          targetText: e.target_text,
          measureRom: e.measure_rom,
          sprintDayExerciseId: e.sprint_day_exercise_id,
          sets: sortSets(((e.workout_sets ?? []) as any[]).map(toSetRow)),
        })
      )
      .sort((a, b) => a.position - b.position),
  };
}

/** Completed sets of this exercise from the most recent *saved* workout. */
async function fetchPreviousSets(exerciseId: string): Promise<PreviousSet[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(`id, workouts!inner ( ended_at ), workout_sets ( ${SET_COLUMNS} )`)
    .eq('exercise_id', exerciseId)
    .not('workouts.ended_at', 'is', null);
  check(error);
  const rows = ((data ?? []) as any[]).filter((r) => r.workouts?.ended_at);
  if (rows.length === 0) return [];
  rows.sort((a, b) => (a.workouts.ended_at < b.workouts.ended_at ? 1 : -1));
  return ((rows[0].workout_sets ?? []) as any[])
    .map(toSetRow)
    .filter((s) => s.completedAt)
    .map((s) => ({
      setNumber: s.setNumber,
      side: s.side,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: s.durationS,
      romValue: s.romValue,
      romUnit: s.romUnit,
    }));
}

/**
 * Previous completed sets per exercise, for the logger's "prev: …" hints.
 * One query per exercise, in parallel.
 */
export async function fetchPreviousSetsForExercises(
  exerciseIds: readonly string[]
): Promise<Record<string, PreviousSet[]>> {
  const unique = Array.from(new Set(exerciseIds));
  const lists = await Promise.all(unique.map((id) => fetchPreviousSets(id)));
  const out: Record<string, PreviousSet[]> = {};
  unique.forEach((id, i) => {
    out[id] = lists[i];
  });
  return out;
}

export async function fetchExerciseCatalog(): Promise<CatalogExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, exercise_type, unilateral, default_sets')
    .order('name');
  check(error);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    exerciseType: r.exercise_type,
    unilateral: !!r.unilateral,
    defaultSets: r.default_sets,
  }));
}

export async function fetchWorkoutHistory(offset: number, limit: number): Promise<WorkoutListItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, title, source, started_at, ended_at, workout_exercises ( id, workout_sets ( id ) )')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .range(offset, offset + limit - 1);
  check(error);
  return ((data ?? []) as any[]).map((w) => ({
    id: w.id,
    title: w.title,
    source: w.source,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    exerciseCount: (w.workout_exercises ?? []).length,
    setCount: (w.workout_exercises ?? []).reduce((n: number, e: any) => n + (e.workout_sets ?? []).length, 0),
  }));
}

// ---- writes --------------------------------------------------------------

export async function startWorkout(input: {
  source: WorkoutSource;
  title: string;
  sprintDayId?: string | null;
}): Promise<StartResult> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ source: input.source, title: input.title, sprint_day_id: input.sprintDayId ?? null })
    .select('id')
    .single();
  if (isInProgressConflict(error)) {
    const active = await fetchActiveWorkout();
    return { ok: false, reason: 'in_progress', activeWorkoutId: active?.id ?? null };
  }
  if (error?.code === '23505' && input.sprintDayId) {
    throw new Error("Today's routine has already been logged.");
  }
  check(error);
  notifyActiveWorkoutChanged();
  return { ok: true, workoutId: (data as any).id };
}

export async function addExercisesToWorkout(workoutId: string, specs: readonly NewWorkoutExercise[]): Promise<void> {
  if (specs.length === 0) return;

  const { data: existing, error: posError } = await supabase
    .from('workout_exercises')
    .select('position')
    .eq('workout_id', workoutId);
  check(posError);
  let position = Math.max(0, ...((existing ?? []) as any[]).map((r) => r.position)) + 1;

  const ids = Array.from(new Set(specs.map((s) => s.exerciseId)));
  const { data: meta, error: metaError } = await supabase
    .from('exercises')
    .select('id, exercise_type, unilateral, default_sets')
    .in('id', ids);
  check(metaError);
  const metaById = new Map(((meta ?? []) as any[]).map((m) => [m.id, m]));

  for (const spec of specs) {
    const m = metaById.get(spec.exerciseId);
    const fields = fieldsForExercise({ exerciseType: m?.exercise_type ?? null, unilateral: !!m?.unilateral });
    const previous = await fetchPreviousSets(spec.exerciseId);

    const { data: weRow, error: weError } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workoutId,
        exercise_id: spec.exerciseId,
        sprint_day_exercise_id: spec.sprintDayExerciseId,
        position: position++,
        target_text: spec.targetText,
      })
      .select('id')
      .single();
    check(weError);

    const count = defaultSetCount(fields.kind, spec.prescribedSets, m?.default_sets ?? null);
    const setRows = plannedRows(count, fields.sided).map((row) => {
      const v = prefillValues(row, previous, fields.kind, spec.targetText);
      return {
        workout_exercise_id: (weRow as any).id,
        set_number: row.setNumber,
        side: row.side,
        reps: v.reps,
        weight_kg: v.weightKg,
        duration_s: v.durationS,
        rom_value: v.romValue,
        rom_unit: v.romUnit,
      };
    });
    const { error: setsError } = await supabase.from('workout_sets').insert(setRows);
    check(setsError);
  }
}

export async function startSprintWorkout(day: SprintDay, painPointName: string): Promise<StartResult> {
  const { data: existing, error: existingError } = await supabase
    .from('workouts')
    .select('id')
    .eq('sprint_day_id', day.id)
    .is('ended_at', null)
    .maybeSingle();
  check(existingError);
  if (existing) return { ok: true, workoutId: (existing as any).id };

  const result = await startWorkout({
    source: 'sprint',
    title: sprintWorkoutTitle(painPointName, day.dayNumber),
    sprintDayId: day.id,
  });
  if (!result.ok) return result;

  try {
    await addExercisesToWorkout(result.workoutId, buildSprintWorkoutExercises(day));
  } catch (err) {
    // An empty sprint workout would be a dead end; remove it so a retry starts clean.
    await supabase.from('workouts').delete().eq('id', result.workoutId);
    notifyActiveWorkoutChanged();
    throw err;
  }
  return result;
}

export async function updateSet(setId: string, patch: SetPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if ('reps' in patch) row.reps = patch.reps;
  if ('weightKg' in patch) row.weight_kg = patch.weightKg;
  if ('durationS' in patch) row.duration_s = patch.durationS;
  if ('romValue' in patch) row.rom_value = patch.romValue;
  if ('romUnit' in patch) row.rom_unit = patch.romUnit;
  if ('setType' in patch) row.set_type = patch.setType;
  if ('completedAt' in patch) row.completed_at = patch.completedAt;
  const { error } = await supabase.from('workout_sets').update(row).eq('id', setId);
  check(error);
}

export async function addSet(workoutExercise: WorkoutExerciseRow): Promise<void> {
  const fields = fieldsForExercise({ exerciseType: workoutExercise.exerciseType, unilateral: workoutExercise.unilateral });
  const sets = workoutExercise.sets;
  const nextNumber = Math.max(0, ...sets.map((s) => s.setNumber)) + 1;
  const sides: Side[] = fields.sided ? ['left', 'right'] : [null];
  const rows = sides.map((side) => {
    const last = [...sets].reverse().find((s) => s.side === side);
    return {
      workout_exercise_id: workoutExercise.id,
      set_number: nextNumber,
      side,
      reps: last?.reps ?? null,
      weight_kg: last?.weightKg ?? null,
      duration_s: last?.durationS ?? null,
      rom_value: null,
      rom_unit: last?.romUnit ?? null,
    };
  });
  const { error } = await supabase.from('workout_sets').insert(rows);
  check(error);
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId);
  check(error);
}

export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const { error } = await supabase.from('workout_exercises').delete().eq('id', workoutExerciseId);
  check(error);
}

export async function setMeasureRom(workoutExerciseId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('workout_exercises').update({ measure_rom: on }).eq('id', workoutExerciseId);
  check(error);
}

export async function finishWorkout(workout: Workout, input: FinishInput): Promise<'saved' | 'no_completed_sets'> {
  const plan = planFinish(workout.exercises);
  if (!plan.ok) return 'no_completed_sets';

  if (plan.deleteSetIds.length > 0) {
    const { error } = await supabase.from('workout_sets').delete().in('id', plan.deleteSetIds);
    check(error);
  }
  if (plan.deleteExerciseIds.length > 0) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', plan.deleteExerciseIds);
    check(error);
  }

  if (workout.sprintDayId) {
    const { data: day, error: dayError } = await supabase
      .from('sprint_days')
      .select('id, day_number, sprint_id')
      .eq('id', workout.sprintDayId)
      .single();
    check(dayError);
    const { data: sprint, error: sprintError } = await supabase
      .from('sprints')
      .select('status')
      .eq('id', (day as any).sprint_id)
      .single();
    check(sprintError);
    const status = (sprint as any).status as string;
    // Only a still-active sprint gets its day completed. An abandoned sprint
    // must not be revived (completeDay's day-14 step would flip it back to
    // pending_reassessment, or hit the one-in-flight index and fail every
    // retry); a sprint already moved on (e.g. by a retry after day 14
    // succeeded) needs nothing more. Either way the workout itself saves.
    if (status === 'active') {
      for (const id of plan.sprintDayExerciseIdsToComplete) {
        await completeExercise(id);
      }
      await completeDay((day as any).id, (day as any).day_number, (day as any).sprint_id);
    }
    if (input.reaction && status !== 'abandoned') {
      await submitDayFeedback((day as any).id, input.reaction, input.reactionNote);
    }
  }

  const { error: endError } = await supabase
    .from('workouts')
    .update({
      title: input.title.trim() || workout.title,
      notes: input.notes.trim() === '' ? null : input.notes.trim(),
      ended_at: new Date().toISOString(),
    })
    .eq('id', workout.id);
  check(endError);
  notifyActiveWorkoutChanged();
  return 'saved';
}

export async function discardWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  check(error);
  notifyActiveWorkoutChanged();
}

export async function updateWorkoutMeta(workoutId: string, title: string, notes: string): Promise<void> {
  // An emptied title keeps the old one, same as Finish.
  const patch: Record<string, string | null> = { notes: notes.trim() === '' ? null : notes.trim() };
  if (title.trim() !== '') patch.title = title.trim();
  const { error } = await supabase.from('workouts').update(patch).eq('id', workoutId);
  check(error);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  check(error);
}
