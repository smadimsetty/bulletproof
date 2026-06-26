// apps/mobile/lib/exerciseLogs.ts
//
// Incremental per-row exercise_logs writes. There is no server-side
// unique constraint to upsert against (confirmed: exercise_logs has only
// a primary key on id) -- so "upsert" here is client-orchestrated: look
// up a matching existing row first, then update if found or insert if
// not. The lookup key varies by exercise shape (design spec Decision 4):
// a prescribed exercise (has recommendationBlockExerciseId) keys on
// (recommendation_block_exercise_id, set_number); an ad-hoc exercise
// (recommendationBlockExerciseId is null) keys on
// (exercise_id, date, set_number). set_number is null for mobility
// checklist items (no set concept), matched via `.is(...)`, not `.eq(...)`,
// since Postgres/PostgREST require IS NULL semantics for a null match.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import type { SessionType } from './recommendations';

export interface ExerciseLogRow {
  readonly id: string;
  readonly recommendationBlockExerciseId: string | null;
  readonly exerciseId: string;
  readonly blockType: SessionType;
  readonly completed: boolean;
  readonly setNumber: number | null;
  readonly repsCompleted: number | null;
  readonly weightKg: number | null;
  readonly loggedAt: string;
  readonly notes: string | null;
}

export interface UpsertExerciseLogInput {
  readonly date: Date;
  readonly recommendationBlockExerciseId: string | null;
  readonly exerciseId: string;
  readonly blockType: SessionType;
  readonly setNumber: number | null;
  readonly completed: boolean;
  readonly repsCompleted: number | null;
  readonly weightKg: number | null;
  readonly notes?: string | null;
}

interface RawExerciseLogRow {
  id: string;
  recommendation_block_exercise_id: string | null;
  exercise_id: string;
  block_type: SessionType;
  completed: boolean;
  set_number: number | null;
  reps_completed: number | null;
  weight_kg: number | null;
  logged_at: string;
  notes: string | null;
}

function toExerciseLogRow(row: RawExerciseLogRow): ExerciseLogRow {
  return {
    id: row.id,
    recommendationBlockExerciseId: row.recommendation_block_exercise_id,
    exerciseId: row.exercise_id,
    blockType: row.block_type,
    completed: row.completed,
    setNumber: row.set_number,
    repsCompleted: row.reps_completed,
    weightKg: row.weight_kg,
    loggedAt: row.logged_at,
    notes: row.notes,
  };
}

/**
 * Fetches today's already-logged rows for a set of
 * recommendation_block_exercise_ids, so reopening a block mid-session
 * shows prior progress instead of resetting to blank. Returns an empty
 * array (no query) when given no ids -- a freshly-added ad-hoc exercise
 * has no prior logs to fetch by this path; its own logged state lives
 * only in local screen state until the first upsert.
 */
export async function fetchTodaysExerciseLogs(
  blockExerciseIds: readonly string[]
): Promise<ExerciseLogRow[]> {
  if (blockExerciseIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('exercise_logs')
    .select(
      'id, recommendation_block_exercise_id, exercise_id, block_type, completed, set_number, reps_completed, weight_kg, logged_at, notes'
    )
    .eq('date', localDateString(new Date()))
    .in('recommendation_block_exercise_id', [...blockExerciseIds]);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as RawExerciseLogRow[]).map(toExerciseLogRow);
}

async function findExistingLogId(input: UpsertExerciseLogInput, dateIso: string): Promise<string | null> {
  let query = supabase.from('exercise_logs').select('id').eq('date', dateIso);

  if (input.recommendationBlockExerciseId != null) {
    query = query.eq('recommendation_block_exercise_id', input.recommendationBlockExerciseId);
  } else {
    query = query.is('recommendation_block_exercise_id', null).eq('exercise_id', input.exerciseId);
  }

  query = input.setNumber != null ? query.eq('set_number', input.setNumber) : query.is('set_number', null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Writes one exercise_logs row: updates the matching existing row if one
 * is found via findExistingLogId's lookup key, otherwise inserts a new
 * one. Called on every checkbox tap and every set-completion -- never
 * batched, per the design spec's "incremental save" requirement.
 */
export async function upsertExerciseLog(input: UpsertExerciseLogInput): Promise<void> {
  if (!input.exerciseId) {
    // Refuse early rather than letting a blank/invalid exercise_id hit
    // the not-null FK column and fail at the database -- that failure
    // would be indistinguishable from a transient network error to every
    // call site's best-effort `.catch()`, which is exactly how this bug
    // went unnoticed: a row whose `exercises` join failed (the RLS gap
    // fixed in 20260624050000_logger_rls_fixes.sql) silently fell back to
    // exerciseId: '' in loggerBlock.ts, and every save for that row
    // failed forever with zero visible feedback. This throws a real,
    // distinguishable error so callers can show the user something
    // instead of a row that quietly never persists.
    throw new Error('This exercise has no resolvable id and cannot be logged.');
  }

  const dateIso = localDateString(input.date);
  const existingId = await findExistingLogId(input, dateIso);

  const payload = {
    date: dateIso,
    recommendation_block_exercise_id: input.recommendationBlockExerciseId,
    exercise_id: input.exerciseId,
    block_type: input.blockType,
    set_number: input.setNumber,
    completed: input.completed,
    reps_completed: input.repsCompleted,
    weight_kg: input.weightKg,
    notes: input.notes ?? null,
  };

  if (existingId) {
    const { error } = await supabase.from('exercise_logs').update(payload).eq('id', existingId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from('exercise_logs').insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Deletes today's logged row for one set (or one mobility checklist item,
 * with setNumber null), if one exists. A no-op, not an error, when no
 * matching row exists -- the swipe-to-delete affordance in StrengthSetRow
 * calls this for sets the user added locally but never blurred/saved yet,
 * same as for ones that were.
 */
export async function deleteExerciseLog(
  recommendationBlockExerciseId: string,
  setNumber: number | null
): Promise<void> {
  let query = supabase
    .from('exercise_logs')
    .delete()
    .eq('date', localDateString(new Date()))
    .eq('recommendation_block_exercise_id', recommendationBlockExerciseId);

  query = setNumber != null ? query.eq('set_number', setNumber) : query.is('set_number', null);

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}
