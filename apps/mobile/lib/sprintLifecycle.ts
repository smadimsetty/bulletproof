// apps/mobile/lib/sprintLifecycle.ts
//
// Data layer for the pain-point sprint flow: pain-point list, starting a
// sprint, resolving its 14 days of exercises via sprintExercisePicker's
// least-recently-used rule, fetching/completing today's day, swapping an
// exercise, and abandoning an in-flight sprint. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// sections 2, 3, and 5 for the schema and lifecycle this implements.
//
// activateSprintAfterBaseline's own day-generation loop is covered by
// manual verification (see the plan's Task 11) rather than a mocked unit
// test -- it chains many sequential Supabase calls across tables, and the
// algorithmic core it depends on (pickExerciseForSlot) already has full
// unit coverage in sprintExercisePicker.test.ts. This file's simpler,
// single-purpose functions are unit tested below.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import { pickExerciseForSlot, slotsForDay, type PoolCandidate, type TemplateRow } from './sprintExercisePicker';

export type SprintStatus = 'pending_baseline' | 'active' | 'pending_reassessment' | 'completed' | 'abandoned';

export interface PainPoint {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
}

export interface Sprint {
  readonly id: string;
  readonly painPointId: string;
  readonly cycleNumber: number;
  readonly startedOn: string;
  readonly status: SprintStatus;
}

export interface SprintDayExercise {
  readonly id: string;
  readonly slotKey: string;
  readonly tier: number;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
  readonly order: number;
  readonly completedAt: string | null;
}

export interface SprintDay {
  readonly id: string;
  readonly sprintId: string;
  readonly dayNumber: number;
  readonly date: string;
  readonly completedAt: string | null;
  readonly exercises: readonly SprintDayExercise[];
}

function toSprint(row: any): Sprint {
  return {
    id: row.id,
    painPointId: row.pain_point_id,
    cycleNumber: row.cycle_number,
    startedOn: row.started_on,
    status: row.status,
  };
}

function toSprintDayExercise(row: any): SprintDayExercise {
  return {
    id: row.id,
    slotKey: row.slot_key,
    tier: row.tier,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? 'Unknown exercise',
    prescribedSets: row.prescribed_sets,
    prescribedRepsOrDuration: row.prescribed_reps_or_duration,
    order: row.exercise_order,
    completedAt: row.completed_at,
  };
}

export async function fetchPainPoints(): Promise<PainPoint[]> {
  const { data, error } = await supabase
    .from('pain_points')
    .select('id, display_name, description')
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
  }));
}

/**
 * A sprint's 14 days run from started_on (day 1) through started_on + 13
 * days (day 14). Once the local calendar has moved past that window the
 * sprint is due for reassessment regardless of whether day 14 was ever
 * ticked off: per the design spec (section 5) missing a day only leaves
 * that day's completed_at null, and "day 15 still triggers reassessment".
 * Without this, completeDay's dayNumber === 14 branch is the only path out
 * of 'active', so missing the last day strands the sprint forever.
 */
export function isSprintPastFinalDay(startedOn: string, now: Date = new Date()): boolean {
  const finalDay = new Date(`${startedOn}T00:00:00`);
  finalDay.setDate(finalDay.getDate() + 13);
  return localDateString(now) > localDateString(finalDay);
}

export async function fetchInFlightSprint(): Promise<Sprint | null> {
  const { data, error } = await supabase
    .from('sprints')
    .select('id, pain_point_id, cycle_number, started_on, status')
    .in('status', ['pending_baseline', 'active', 'pending_reassessment'])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const sprint = toSprint(data);
  if (sprint.status === 'active' && isSprintPastFinalDay(sprint.startedOn)) {
    const { error: reassessError } = await supabase
      .from('sprints')
      .update({ status: 'pending_reassessment' })
      .eq('id', sprint.id);
    if (reassessError) throw new Error(reassessError.message);
    return { ...sprint, status: 'pending_reassessment' };
  }
  return sprint;
}

export async function beginSprint(painPointId: string): Promise<Sprint> {
  const { count, error: countError } = await supabase
    .from('sprints')
    .select('id', { count: 'exact', head: true })
    .eq('pain_point_id', painPointId);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data, error } = await supabase
    .from('sprints')
    .insert({
      pain_point_id: painPointId,
      cycle_number: (count ?? 0) + 1,
      started_on: localDateString(new Date()),
      status: 'pending_baseline',
    })
    .select('id, pain_point_id, cycle_number, started_on, status')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return toSprint(data);
}

async function fetchLastCompletedByExerciseId(painPointId: string): Promise<Map<string, string>> {
  const { data: sprintRows, error: sprintsError } = await supabase
    .from('sprints')
    .select('id')
    .eq('pain_point_id', painPointId);
  if (sprintsError) throw new Error(sprintsError.message);

  const sprintIds = ((sprintRows ?? []) as any[]).map((r) => r.id);
  if (sprintIds.length === 0) {
    return new Map();
  }

  const { data: dayRows, error: daysError } = await supabase
    .from('sprint_days')
    .select('id')
    .in('sprint_id', sprintIds);
  if (daysError) throw new Error(daysError.message);

  const dayIds = ((dayRows ?? []) as any[]).map((r) => r.id);
  if (dayIds.length === 0) {
    return new Map();
  }

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('sprint_day_exercises')
    .select('exercise_id, completed_at')
    .in('sprint_day_id', dayIds)
    .not('completed_at', 'is', null);
  if (exercisesError) throw new Error(exercisesError.message);

  const result = new Map<string, string>();
  for (const row of (exerciseRows ?? []) as any[]) {
    const existing = result.get(row.exercise_id);
    if (!existing || row.completed_at > existing) {
      result.set(row.exercise_id, row.completed_at);
    }
  }
  return result;
}

export async function activateSprintAfterBaseline(sprint: Sprint): Promise<void> {
  const { data: templateRows, error: templateError } = await supabase
    .from('sprint_day_template')
    .select('day_number, slot_key, tier, slot_order')
    .eq('pain_point_id', sprint.painPointId);
  if (templateError) throw new Error(templateError.message);

  const template: TemplateRow[] = ((templateRows ?? []) as any[]).map((row) => ({
    dayNumber: row.day_number,
    slotKey: row.slot_key,
    tier: row.tier,
    slotOrder: row.slot_order,
  }));

  const { data: pool, error: poolError } = await supabase
    .from('sprint_exercise_pool')
    .select('slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration')
    .eq('pain_point_id', sprint.painPointId);
  if (poolError) throw new Error(poolError.message);

  const lastCompletedByExerciseId = await fetchLastCompletedByExerciseId(sprint.painPointId);

  const poolBySlot = new Map<string, any[]>();
  for (const row of (pool ?? []) as any[]) {
    const list = poolBySlot.get(row.slot_key) ?? [];
    list.push(row);
    poolBySlot.set(row.slot_key, list);
  }

  const startedOn = new Date(`${sprint.startedOn}T00:00:00`);

  // Retry-safety, part one: which days (if any) a previous, interrupted
  // activation already filled in. sprint_day_exercises has no natural
  // unique key to upsert on (see
  // 20260916130500_create_sprint_days_and_exercises.sql), so an already
  // populated day is skipped outright -- that preserves its completed_at
  // and swap history instead of duplicating rows. Resolved in two queries
  // up front rather than a per-iteration check, so the ordinary
  // fresh-sprint path costs one extra round trip, not fourteen.
  const { data: existingDayRows, error: existingDaysError } = await supabase
    .from('sprint_days')
    .select('id')
    .eq('sprint_id', sprint.id);
  if (existingDaysError) throw new Error(existingDaysError.message);

  const existingDayIds = ((existingDayRows ?? []) as any[]).map((r) => r.id);
  const daysAlreadyPopulated = new Set<string>();
  if (existingDayIds.length > 0) {
    const { data: existingExercises, error: existingExercisesError } = await supabase
      .from('sprint_day_exercises')
      .select('sprint_day_id')
      .in('sprint_day_id', existingDayIds);
    if (existingExercisesError) throw new Error(existingExercisesError.message);
    for (const row of (existingExercises ?? []) as any[]) {
      daysAlreadyPopulated.add(row.sprint_day_id);
    }
  }

  for (let dayNumber = 1; dayNumber <= 14; dayNumber++) {
    const dayDate = new Date(startedOn);
    dayDate.setDate(dayDate.getDate() + dayNumber - 1);

    // Retry-safety, part two: upsert, not insert. If a previous activation
    // attempt died partway through this 14-iteration loop (a dropped
    // request on a phone), a plain insert would trip sprint_days'
    // unique(sprint_id, day_number) on the days that did get written, and
    // the sprint could never be recovered.
    const { data: dayRow, error: dayError } = await supabase
      .from('sprint_days')
      .upsert(
        { sprint_id: sprint.id, day_number: dayNumber, date: localDateString(dayDate) },
        { onConflict: 'sprint_id,day_number' }
      )
      .select('id')
      .single();
    if (dayError) throw new Error(dayError.message);

    if (daysAlreadyPopulated.has((dayRow as any).id)) {
      continue;
    }

    const daySlots = slotsForDay(template, dayNumber);
    const exerciseRows = daySlots.map((slot) => {
      const candidates: PoolCandidate[] = (poolBySlot.get(slot.slotKey) ?? []).map((p) => ({
        exerciseId: p.exercise_id,
        defaultRank: p.default_rank,
      }));
      const chosenExerciseId = pickExerciseForSlot(candidates, lastCompletedByExerciseId);
      const chosenPoolRow = (poolBySlot.get(slot.slotKey) ?? []).find((p) => p.exercise_id === chosenExerciseId);

      return {
        sprint_day_id: dayRow.id,
        slot_key: slot.slotKey,
        tier: slot.tier,
        exercise_id: chosenExerciseId,
        prescribed_sets: chosenPoolRow.prescribed_sets,
        prescribed_reps_or_duration: chosenPoolRow.prescribed_reps_or_duration,
        exercise_order: slot.slotOrder,
      };
    });

    if (exerciseRows.length > 0) {
      const { error: exercisesError } = await supabase.from('sprint_day_exercises').insert(exerciseRows);
      if (exercisesError) throw new Error(exercisesError.message);
    }
  }

  // The single place a sprint becomes 'active', and only once all 14 days
  // exist. submitAssessment deliberately no longer does this for the
  // baseline phase -- an 'active' sprint with missing days is the same
  // dead end as a sprint stuck past day 14.
  const { error: activateError } = await supabase.from('sprints').update({ status: 'active' }).eq('id', sprint.id);
  if (activateError) throw new Error(activateError.message);
}

const SPRINT_DAY_EXERCISE_SELECT =
  'id, slot_key, tier, exercise_id, prescribed_sets, prescribed_reps_or_duration, exercise_order, completed_at, exercises!exercise_id ( name )';

export async function fetchTodaySprintDay(sprintId: string): Promise<SprintDay | null> {
  const todayIso = localDateString(new Date());
  const { data: dayRow, error: dayError } = await supabase
    .from('sprint_days')
    .select('id, sprint_id, day_number, date, completed_at')
    .eq('sprint_id', sprintId)
    .eq('date', todayIso)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!dayRow) return null;

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('sprint_day_exercises')
    .select(SPRINT_DAY_EXERCISE_SELECT)
    .eq('sprint_day_id', (dayRow as any).id)
    .order('exercise_order');
  if (exercisesError) throw new Error(exercisesError.message);

  return {
    id: (dayRow as any).id,
    sprintId: (dayRow as any).sprint_id,
    dayNumber: (dayRow as any).day_number,
    date: (dayRow as any).date,
    completedAt: (dayRow as any).completed_at,
    exercises: ((exerciseRows ?? []) as any[]).map(toSprintDayExercise),
  };
}

export async function completeExercise(sprintDayExerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_exercises')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sprintDayExerciseId);
  if (error) throw new Error(error.message);
}

export async function completeDay(sprintDayId: string, dayNumber: number, sprintId: string): Promise<void> {
  const { error: dayError } = await supabase
    .from('sprint_days')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sprintDayId);
  if (dayError) throw new Error(dayError.message);

  if (dayNumber === 14) {
    const { error: sprintError } = await supabase
      .from('sprints')
      .update({ status: 'pending_reassessment' })
      .eq('id', sprintId);
    if (sprintError) throw new Error(sprintError.message);
  }
}

export interface SwapCandidate {
  readonly exerciseId: string;
  readonly name: string;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
}

export async function fetchSwapCandidates(
  painPointId: string,
  slotKey: string,
  excludingExerciseId: string
): Promise<ReadonlyArray<SwapCandidate>> {
  const { data, error } = await supabase
    .from('sprint_exercise_pool')
    .select('exercise_id, prescribed_sets, prescribed_reps_or_duration, exercises ( name )')
    .eq('pain_point_id', painPointId)
    .eq('slot_key', slotKey)
    .neq('exercise_id', excludingExerciseId);

  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    exerciseId: row.exercise_id,
    name: row.exercises?.name ?? 'Unknown exercise',
    prescribedSets: row.prescribed_sets ?? null,
    prescribedRepsOrDuration: row.prescribed_reps_or_duration ?? null,
  }));
}

/**
 * Same-slot candidates genuinely differ in dosage (heel raises 2x15 reps vs.
 * toe/heel walks 1x20m), so the new exercise's own prescription has to move
 * with it -- otherwise the row shows the new name under the old sets/reps.
 */
export async function swapExercise(
  sprintDayExerciseId: string,
  currentExerciseId: string,
  newExerciseId: string,
  prescribedSets: number | null,
  prescribedRepsOrDuration: string | null
): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_exercises')
    .update({
      exercise_id: newExerciseId,
      swapped_from_exercise_id: currentExerciseId,
      prescribed_sets: prescribedSets,
      prescribed_reps_or_duration: prescribedRepsOrDuration,
    })
    .eq('id', sprintDayExerciseId);
  if (error) throw new Error(error.message);
}

export async function submitDayFeedback(
  sprintDayId: string,
  reaction: 'good' | 'neutral' | 'hurt',
  note: string
): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_feedback')
    .upsert(
      { sprint_day_id: sprintDayId, reaction, note: note.trim() === '' ? null : note.trim() },
      { onConflict: 'sprint_day_id' }
    );
  if (error) throw new Error(error.message);
}

export async function abandonSprint(sprintId: string): Promise<void> {
  const { error } = await supabase.from('sprints').update({ status: 'abandoned' }).eq('id', sprintId);
  if (error) throw new Error(error.message);
}
