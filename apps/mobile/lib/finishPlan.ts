// Pure "what does Save do" (spec section 4, Finish steps 1-4).
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
