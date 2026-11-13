// apps/mobile/lib/ladderData.ts
//
// Reads a pain point's slot ladder (global content, read-only to the user).
import type { LadderRow } from './engine/dayPlanner';
import { supabase } from './supabase';

/** The pain point's ladder (optionally one slot) joined to each exercise's equipment, FK-hinted. */
export async function fetchLadder(painPointId: string, slotKey?: string): Promise<(LadderRow & { name: string })[]> {
  let q = supabase
    .from('slot_ladder')
    .select('slot_key, level, exercise_id, alt_rank, step, sets, reps_or_duration, exercises!slot_ladder_exercise_id_fkey ( name, equipment_needed, unilateral )')
    .eq('pain_point_id', painPointId);
  if (slotKey) q = q.eq('slot_key', slotKey);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    slotKey: r.slot_key,
    level: r.level,
    exerciseId: r.exercise_id,
    altRank: r.alt_rank,
    step: r.step,
    sets: r.sets,
    repsOrDuration: r.reps_or_duration,
    equipment: (r.exercises?.equipment_needed ?? null) as string[] | null,
    unilateral: !!r.exercises?.unilateral,
    isStretch: false,
    name: (r.exercises?.name ?? 'Unknown exercise') as string,
  }));
}
