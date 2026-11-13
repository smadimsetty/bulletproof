// apps/mobile/lib/sprintLifecycle.ts
//
// Data layer for the pain-point sprint flow: pain-point list, starting a
// sprint, laying out its 14 days, fetching/completing today's day (built
// lazily by sprintEngine.ensureDayBuilt, see
// docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md),
// swapping an exercise, and abandoning an in-flight sprint. The original
// schema and lifecycle are in
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// sections 2, 3, and 5.
//
// The day-building algorithm is unit tested in sprintEngine.test.ts and
// engine/*.test.ts; this file's simpler, single-purpose functions are unit
// tested in sprintLifecycle.test.ts.
import { eyeCue } from './exerciseCue';
import { supabase } from './supabase';
import { localDateString } from './localDate';
import { fetchUserSettings } from './userSettings';
import { filterCandidatesByTier } from './sprintExercisePicker';
import { ensureDayBuilt, initSlotState } from './sprintEngine';
import { planStepDown, swapOptionsAtLevel } from './engine/ladderPick';
import { fetchLadder } from './ladderData';
import type { Side } from './engine/types';

export type SprintStatus = 'pending_baseline' | 'active' | 'pending_reassessment' | 'completed' | 'abandoned';

export interface PainPoint {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly tagline: string | null;
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
  /** exercises.cue (one line), shown behind the eye-icon toggle. */
  readonly description: string | null;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
  readonly order: number;
  readonly completedAt: string | null;
  /** Ladder level and step (null on days built before the adaptive engine). */
  readonly level: number | null;
  readonly step: number | null;
  /** Weaker side to log first, when the slot has a flagged side gap. */
  readonly leadSide: Side | null;
  /** True when the weaker side gets one extra set. */
  readonly extraSideSet: boolean;
}

export interface SprintDay {
  readonly id: string;
  readonly sprintId: string;
  readonly dayNumber: number;
  readonly date: string;
  readonly completedAt: string | null;
  /** Short rules-written reason for today's plan (null on pre-engine days). */
  readonly whyToday: string | null;
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
    description: eyeCue(row.exercises),
    prescribedSets: row.prescribed_sets,
    prescribedRepsOrDuration: row.prescribed_reps_or_duration,
    order: row.exercise_order,
    completedAt: row.completed_at,
    level: row.level ?? null,
    step: row.step ?? null,
    leadSide: row.lead_side ?? null,
    extraSideSet: !!row.extra_side_set,
  };
}

export async function fetchPainPoints(): Promise<PainPoint[]> {
  const { data, error } = await supabase
    .from('pain_points')
    .select('id, display_name, description, tagline')
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    tagline: row.tagline ?? null,
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

export async function fetchLastCompletedByExerciseId(painPointId: string): Promise<Map<string, string>> {
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

/**
 * Lays out the sprint's 14 empty days and its slot state, then marks it active.
 * Exercises are not chosen here: each day is built lazily by sprintEngine.ensureDayBuilt
 * the first time it is opened, from the progression up to that day.
 * Retry-safe: days are upserted on (sprint_id, day_number) and slot state is only
 * created where missing, so an interrupted activation can simply be run again.
 */
export async function activateSprintAfterBaseline(sprint: Sprint): Promise<void> {
  const startedOn = new Date(`${sprint.startedOn}T00:00:00`);
  const days = Array.from({ length: 14 }, (_, i) => {
    const dayDate = new Date(startedOn);
    dayDate.setDate(dayDate.getDate() + i);
    return { sprint_id: sprint.id, day_number: i + 1, date: localDateString(dayDate) };
  });
  const { error: daysError } = await supabase
    .from('sprint_days')
    .upsert(days, { onConflict: 'sprint_id,day_number', ignoreDuplicates: true });
  if (daysError) throw new Error(daysError.message);

  await initSlotState(sprint.id, sprint.painPointId);

  // The single place a sprint becomes 'active', and only once all 14 days
  // exist. submitAssessment deliberately no longer does this for the
  // baseline phase -- an 'active' sprint with missing days is the same
  // dead end as a sprint stuck past day 14.
  const { error: activateError } = await supabase.from('sprints').update({ status: 'active' }).eq('id', sprint.id);
  if (activateError) throw new Error(activateError.message);
}

const SPRINT_DAY_EXERCISE_SELECT =
  'id, slot_key, tier, exercise_id, prescribed_sets, prescribed_reps_or_duration, exercise_order, completed_at, level, step, lead_side, extra_side_set, exercises!sprint_day_exercises_exercise_id_fkey ( name, cue, description, owner_id )';

export async function fetchTodaySprintDay(sprintId: string): Promise<SprintDay | null> {
  const todayIso = localDateString(new Date());
  await ensureDayBuilt(sprintId, todayIso);
  const { data: dayRow, error: dayError } = await supabase
    .from('sprint_days')
    .select('id, sprint_id, day_number, date, completed_at, why_today')
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
    whyToday: (dayRow as any).why_today ?? null,
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
  /** Ladder position of the candidate (absent on pre-engine days). */
  readonly level?: number;
  readonly step?: number;
}

/**
 * Swap options for a slot. On an engine-built day (`level` set) these are the
 * tier-allowed alternates at the SAME ladder level, prescribed for the current
 * step (spec 2026-11-12 §8a.5). A pre-engine day (level null) keeps the old
 * whole-pool behaviour.
 */
export async function fetchSwapCandidates(
  painPointId: string,
  slotKey: string,
  level: number | null,
  excludingExerciseId: string,
  step: number = 1
): Promise<ReadonlyArray<SwapCandidate>> {
  const equipmentTierOf = async () => (await fetchUserSettings().catch(() => null))?.equipmentTier ?? null;

  if (level != null) {
    const ladder = await fetchLadder(painPointId, slotKey);
    const names = new Map(ladder.map((r) => [r.exerciseId, r.name]));
    return swapOptionsAtLevel(ladder, slotKey, level, step, await equipmentTierOf(), excludingExerciseId).map((c) => ({
      exerciseId: c.exerciseId,
      name: names.get(c.exerciseId) ?? 'Unknown exercise',
      prescribedSets: c.sets,
      prescribedRepsOrDuration: c.repsOrDuration,
      level: c.level,
      step: c.step,
    }));
  }

  const { data, error } = await supabase
    .from('sprint_exercise_pool')
    .select('exercise_id, prescribed_sets, prescribed_reps_or_duration, exercises!sprint_exercise_pool_exercise_id_fkey ( name, equipment_needed )')
    .eq('pain_point_id', painPointId)
    .eq('slot_key', slotKey)
    .neq('exercise_id', excludingExerciseId);

  if (error) throw new Error(error.message);
  const equipmentTier = await equipmentTierOf();
  const mapped = ((data ?? []) as any[]).map((row) => ({
    exerciseId: row.exercise_id,
    name: row.exercises?.name ?? 'Unknown exercise',
    prescribedSets: row.prescribed_sets ?? null,
    prescribedRepsOrDuration: row.prescribed_reps_or_duration ?? null,
    equipment: (row.exercises?.equipment_needed ?? null) as string[] | null,
  }));
  return filterCandidatesByTier(mapped, equipmentTier).map(({ equipment: _equipment, ...candidate }) => candidate);
}

/**
 * Same-slot candidates genuinely differ in dosage (heel raises 2x15 reps vs.
 * toe/heel walks 1x20m), so the new exercise's own prescription has to move
 * with it -- otherwise the row shows the new name under the old sets/reps.
 * A swap stays within the slot's level, so the slot state is untouched.
 */
export async function swapExercise(
  sprintDayExerciseId: string,
  currentExerciseId: string,
  newExerciseId: string,
  prescribedSets: number | null,
  prescribedRepsOrDuration: string | null,
  level?: number,
  step?: number
): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_exercises')
    .update({
      exercise_id: newExerciseId,
      swapped_from_exercise_id: currentExerciseId,
      prescribed_sets: prescribedSets,
      prescribed_reps_or_duration: prescribedRepsOrDuration,
      ...(level != null ? { level } : {}),
      ...(step != null ? { step } : {}),
    })
    .eq('id', sprintDayExerciseId);
  if (error) throw new Error(error.message);
}

/**
 * "Easier version": steps the slot back one step (spec §8a.5, counted as a
 * step back in its state) and rewrites today's row to that step's exercise and
 * prescription. Throws when the slot is already at its easiest.
 */
export async function stepDownExercise(sprintDayExerciseId: string, sprintId: string, slotKey: string): Promise<void> {
  const [{ data: sprint, error: sprintError }, { data: row, error: rowError }, { data: stateRow, error: stateError }] =
    await Promise.all([
      supabase.from('sprints').select('pain_point_id').eq('id', sprintId).single(),
      supabase.from('sprint_day_exercises').select('exercise_id, level, step').eq('id', sprintDayExerciseId).single(),
      supabase.from('sprint_slot_state').select('*').eq('sprint_id', sprintId).eq('slot_key', slotKey).maybeSingle(),
    ]);
  if (sprintError) throw new Error(sprintError.message);
  if (rowError) throw new Error(rowError.message);
  if (stateError) throw new Error(stateError.message);

  const painPointId = (sprint as any).pain_point_id as string;
  const current = (row as any).exercise_id as string;
  const s: any = stateRow;
  const state = {
    slotKey,
    level: s?.level ?? (row as any).level ?? 1,
    step: s?.step ?? (row as any).step ?? 1,
    rightStreak: s?.right_streak ?? 0,
    hardStreak: s?.hard_streak ?? 0,
    lastDoneOn: s?.last_done_on ?? null,
    gapBackApplied: s?.gap_back_applied ?? 0,
  };
  const [ladder, settings, lastDone] = await Promise.all([
    fetchLadder(painPointId, slotKey),
    fetchUserSettings().catch(() => null),
    fetchLastCompletedByExerciseId(painPointId).catch(() => new Map<string, string>()),
  ]);
  const plan = planStepDown(state, ladder, current, settings?.equipmentTier ?? null, lastDone);
  if (!plan) throw new Error('This is already the easiest version.');

  const { error: updateError } = await supabase
    .from('sprint_day_exercises')
    .update({
      exercise_id: plan.choice.exerciseId,
      ...(plan.choice.exerciseId !== current ? { swapped_from_exercise_id: current } : {}),
      prescribed_sets: plan.choice.sets,
      prescribed_reps_or_duration: plan.choice.repsOrDuration,
      level: plan.choice.level,
      step: plan.choice.step,
    })
    .eq('id', sprintDayExerciseId);
  if (updateError) throw new Error(updateError.message);

  const { error: upsertError } = await supabase.from('sprint_slot_state').upsert(
    {
      sprint_id: sprintId,
      slot_key: slotKey,
      level: plan.state.level,
      step: plan.state.step,
      right_streak: plan.state.rightStreak,
      hard_streak: plan.state.hardStreak,
      last_done_on: plan.state.lastDoneOn,
      gap_back_applied: plan.state.gapBackApplied,
    },
    { onConflict: 'sprint_id,slot_key' }
  );
  if (upsertError) throw new Error(upsertError.message);
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

/**
 * End `oldSprintId` and start a new sprint on `painPointId` in one transaction
 * (rpc switch_sprint), so a failed start never leaves the user with no sprint.
 */
export async function switchSprint(oldSprintId: string, painPointId: string): Promise<Sprint> {
  const { data, error } = await supabase.rpc('switch_sprint', {
    p_old_sprint_id: oldSprintId,
    p_pain_point_id: painPointId,
    p_started_on: localDateString(new Date()),
  });
  if (error) throw new Error(error.message);
  return toSprint(data);
}

export async function abandonSprint(sprintId: string): Promise<void> {
  const { error } = await supabase.from('sprints').update({ status: 'abandoned' }).eq('id', sprintId);
  if (error) throw new Error(error.message);
}
