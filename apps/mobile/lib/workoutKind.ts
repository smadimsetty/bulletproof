// apps/mobile/lib/workoutKind.ts
//
// The "dominant" kind of a finished workout -- the set kind with the most
// completed working sets -- used to pick the Apple Health activity type.
// Ties go to the first kind in KIND_ORDER (mobility first: this is a
// mobility-first app, so a 50/50 workout reads as flexibility).
import { fieldsForExercise, type SetKind } from './setFields';

const KIND_ORDER: SetKind[] = ['hold', 'weight_reps', 'reps', 'duration'];

export function dominantKind(
  exercises: readonly {
    exerciseType: string | null;
    unilateral: boolean;
    sets: readonly { setType: 'warmup' | 'working'; completedAt: string | null }[];
  }[]
): SetKind {
  const counts = new Map<SetKind, number>();
  for (const e of exercises) {
    const kind = fieldsForExercise({ exerciseType: e.exerciseType, unilateral: e.unilateral }).kind;
    const done = e.sets.filter((s) => s.completedAt != null && s.setType === 'working').length;
    if (done > 0) counts.set(kind, (counts.get(kind) ?? 0) + done);
  }
  let best: SetKind = 'hold';
  let bestCount = 0;
  for (const kind of KIND_ORDER) {
    const c = counts.get(kind) ?? 0;
    if (c > bestCount) {
      best = kind;
      bestCount = c;
    }
  }
  return best;
}
