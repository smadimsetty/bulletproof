// apps/mobile/lib/programDisplay.ts
//
// Pure display-formatting helpers for a block exercise's prescribed
// sets/reps. `prescribed_reps` is free text written by the engine in
// inconsistent formats across real rows in the same block ("10 reps/side"
// vs "30-45s hold") -- confirmed against live production data -- so this
// composes a single label without ever parsing or normalizing the reps
// string itself. See docs/superpowers/specs/2026-06-24-home-screen-design.md
// Decision 5.
import type { BlockExercise } from './homeProgram';

export function formatSetsReps(exercise: BlockExercise): string {
  const { prescribedSets, prescribedReps } = exercise;

  if (prescribedSets != null && prescribedReps) {
    return `${prescribedSets} x ${prescribedReps}`;
  }
  if (prescribedSets != null) {
    return `${prescribedSets} sets`;
  }
  if (prescribedReps) {
    return prescribedReps;
  }
  return '';
}
