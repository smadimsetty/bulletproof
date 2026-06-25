// Swap/remove/add operate on recommendation_block_exercises directly --
// never on exercises (the global catalog) or exercise_logs (history is
// independent, see exerciseLogs.ts's module comment and design spec
// Decision 12). Requires the owner_write_recommendation_block_exercises
// policy added in supabase/migrations/20260624050000_logger_rls_fixes.sql
// -- without it every call here fails at the RLS layer with no policy
// to satisfy. See docs/superpowers/specs/2026-06-24-logger-design.md
// Decision 11.
import { supabase } from './supabase';

/**
 * Replaces a block exercise row's prescribed exercise, recording the
 * previous exercise_id in swapped_from_exercise_id as an audit trail.
 * Does not touch prescribed_sets/prescribed_reps/notes -- those stay as
 * prescribed; only which exercise fulfills the slot changes. Existing
 * exercise_logs rows referencing this recommendation_block_exercise_id
 * are left untouched (design spec Decision 12).
 */
export async function swapBlockExercise(
  rowId: string,
  newExerciseId: string,
  previousExerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from('recommendation_block_exercises')
    .update({ exercise_id: newExerciseId, swapped_from_exercise_id: previousExerciseId })
    .eq('id', rowId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Removes a row from the active block. Existing exercise_logs rows
 * referencing it are not deleted (no cascade on that FK) -- the logged
 * history of what was actually done stays intact even after the
 * prescription is removed.
 */
export async function removeBlockExercise(rowId: string): Promise<void> {
  const { error } = await supabase.from('recommendation_block_exercises').delete().eq('id', rowId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Appends an ad-hoc exercise to the block, ordered immediately after the
 * current highest exercise_order (0 if the block has none yet). Leaves
 * prescribed_sets/prescribed_reps/prescribed_weight_note/notes null --
 * an ad-hoc addition has no engine-generated prescription, only whatever
 * the user logs against it via exerciseLogs.ts.
 */
export async function addBlockExercise(
  blockId: string,
  exerciseId: string,
  currentExerciseOrders: readonly number[]
): Promise<{ id: string }> {
  const nextOrder = currentExerciseOrders.length === 0 ? 0 : Math.max(...currentExerciseOrders) + 1;

  const { data, error } = await supabase
    .from('recommendation_block_exercises')
    .insert({
      block_id: blockId,
      exercise_id: exerciseId,
      exercise_order: nextOrder,
      is_unilateral_left_first: false,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string };
}
