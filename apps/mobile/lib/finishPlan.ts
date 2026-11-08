// Pure "what does Save do" (spec section 4, Finish steps 1-4).
import { sameSetValues, type SetValues } from './setFields';

export interface FinishInputExercise {
  readonly id: string;
  readonly sprintDayExerciseId: string | null;
  readonly sets: readonly { readonly id: string; readonly completedAt: string | null }[];
}

export type FinishPlan =
  | { readonly ok: false; readonly reason: 'no_completed_sets' }
  | {
      readonly ok: true;
      readonly deleteSetIds: string[];
      readonly deleteExerciseIds: string[];
      readonly sprintDayExerciseIdsToComplete: string[];
    };

export function planFinish(exercises: readonly FinishInputExercise[]): FinishPlan {
  const deleteSetIds: string[] = [];
  const deleteExerciseIds: string[] = [];
  const sprintDayExerciseIdsToComplete: string[] = [];
  let anyCompleted = false;

  for (const ex of exercises) {
    const done = ex.sets.filter((s) => s.completedAt);
    deleteSetIds.push(...ex.sets.filter((s) => !s.completedAt).map((s) => s.id));
    if (done.length === 0) {
      deleteExerciseIds.push(ex.id);
    } else {
      anyCompleted = true;
      if (ex.sprintDayExerciseId) sprintDayExerciseIdsToComplete.push(ex.sprintDayExerciseId);
    }
  }

  if (!anyCompleted) return { ok: false, reason: 'no_completed_sets' };
  return { ok: true, deleteSetIds, deleteExerciseIds, sprintDayExerciseIdsToComplete };
}

export interface DraftableSet extends SetValues {
  readonly id: string;
  readonly completedAt: string | null;
}

/**
 * Completed sets whose local draft differs from the stored row: edits made
 * on an already-ticked row that never reached the DB (no blur happened).
 * Uncompleted rows are excluded -- they persist on ✓ and are deleted on
 * Finish anyway.
 */
export function dirtyCompletedSets(
  exercises: readonly { readonly sets: readonly DraftableSet[] }[],
  drafts: Readonly<Record<string, SetValues>>
): { id: string; values: SetValues }[] {
  const dirty: { id: string; values: SetValues }[] = [];
  for (const ex of exercises) {
    for (const s of ex.sets) {
      const draft = drafts[s.id];
      if (!s.completedAt || !draft) continue;
      if (!sameSetValues(draft, s)) dirty.push({ id: s.id, values: draft });
    }
  }
  return dirty;
}
