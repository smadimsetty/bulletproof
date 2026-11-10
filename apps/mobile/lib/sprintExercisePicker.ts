//
// The entire "engine" behind a sprint day's exercise selection: for a given
// slot, pick whichever pool candidate this owner completed least recently
// (never-completed beats any completed date), falling back to default_rank
// the first time through. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md section
// 3 -- this is deliberately the entire algorithm, no ML, consistent with
// the project's existing rules-based-engine-first principle.
import { requiredTier, tierAllows, type EquipmentTier } from './equipmentTiers';

export interface PoolCandidate {
  readonly exerciseId: string;
  readonly defaultRank: number;
  /** exercises.equipment_needed of the candidate; used by filterCandidatesByTier. */
  readonly equipment?: readonly string[] | null;
}

/**
 * @param lastCompletedByExerciseId exerciseId -> ISO date/timestamp string
 *   of that exercise's most recent completion by this owner, across all of
 *   their past and current sprints of this pain point. A candidate absent
 *   from this map has never been completed and is treated as older than
 *   any date present in it.
 */
export function pickExerciseForSlot(
  candidates: readonly PoolCandidate[],
  lastCompletedByExerciseId: ReadonlyMap<string, string>
): string {
  if (candidates.length === 0) {
    throw new Error('pickExerciseForSlot called with an empty candidate list');
  }

  const ranked = [...candidates].sort((a, b) => {
    const aCompleted = lastCompletedByExerciseId.get(a.exerciseId);
    const bCompleted = lastCompletedByExerciseId.get(b.exerciseId);

    if (aCompleted === undefined && bCompleted === undefined) {
      return a.defaultRank - b.defaultRank;
    }
    if (aCompleted === undefined) return -1;
    if (bCompleted === undefined) return 1;
    if (aCompleted !== bCompleted) {
      return aCompleted < bCompleted ? -1 : 1;
    }
    return a.defaultRank - b.defaultRank;
  });

  return ranked[0].exerciseId;
}

export interface TemplateRow {
  readonly dayNumber: number;
  readonly slotKey: string;
  readonly tier: number;
  readonly slotOrder: number;
}

/** Filters a pain point's full 14-day template down to one day's slots. */
export function slotsForDay(template: readonly TemplateRow[], dayNumber: number): TemplateRow[] {
  return template.filter((row) => row.dayNumber === dayNumber);
}

/**
 * Keeps only candidates the user's equipment tier allows. A null tier keeps
 * everything. If nothing is allowed, the original list comes back so a slot is
 * never left empty.
 */
export function filterCandidatesByTier<T extends { equipment: readonly string[] | null }>(
  candidates: readonly T[],
  tier: EquipmentTier | null
): T[] {
  const allowed = candidates.filter((c) => tierAllows(tier, requiredTier(c.equipment)));
  return allowed.length > 0 ? allowed : [...candidates];
}
