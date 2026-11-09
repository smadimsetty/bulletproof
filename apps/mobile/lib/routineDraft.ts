// apps/mobile/lib/routineDraft.ts
//
// Pure conversion between the routine editor's text-field drafts and the
// numbers stored in routine_exercises. Weight is typed in the user's unit and
// stored in kg (see lib/units.ts).
import { fieldsForExercise, type SetKind } from './setFields';
import { displayUnitToKg, formatWeightForDisplay, type WeightUnit } from './units';
import type { RoutineExercise, RoutineExerciseInput } from './routines';

export interface RoutineExerciseDraft {
  key: string;
  exerciseId: string;
  exerciseName: string;
  exerciseType: string | null;
  unilateral: boolean;
  sets: string;
  reps: string;
  durationS: string;
  weight: string;
  restS: string;
  /** Carried through untouched; the editor has no notes field per exercise. */
  notes: string | null;
}

export function draftKind(d: Pick<RoutineExerciseDraft, 'exerciseType' | 'unilateral'>): SetKind {
  return fieldsForExercise({ exerciseType: d.exerciseType, unilateral: d.unilateral }).kind;
}

function intOrNull(text: string): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function numberOrNull(text: string): number | null {
  const n = Number.parseFloat(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function newDraft(
  e: { id: string; name: string; exerciseType: string | null; unilateral: boolean; defaultSets?: number | null },
  key: string
): RoutineExerciseDraft {
  const kind = fieldsForExercise({ exerciseType: e.exerciseType, unilateral: e.unilateral }).kind;
  const sets = e.defaultSets && e.defaultSets > 0 ? e.defaultSets : kind === 'hold' ? 2 : kind === 'duration' ? 1 : 3;
  return {
    key, exerciseId: e.id, exerciseName: e.name, exerciseType: e.exerciseType, unilateral: e.unilateral,
    sets: String(sets), reps: '', durationS: kind === 'hold' ? '30' : '', weight: '', restS: '', notes: null,
  };
}

export function draftFromRoutineExercise(e: RoutineExercise, key: string, unit: WeightUnit): RoutineExerciseDraft {
  return {
    key, exerciseId: e.exerciseId, exerciseName: e.exerciseName, exerciseType: e.exerciseType, unilateral: e.unilateral,
    sets: String(e.targetSets),
    reps: e.targetReps == null ? '' : String(e.targetReps),
    durationS: e.targetDurationS == null ? '' : String(e.targetDurationS),
    weight: formatWeightForDisplay(e.targetWeightKg, unit),
    restS: e.restS == null ? '' : String(e.restS),
    notes: e.notes,
  };
}

function setsProblem(d: Pick<RoutineExerciseDraft, 'exerciseName'>): string {
  return `Enter sets for ${d.exerciseName}`;
}

/** Sets clamp to 1..20 and rest to 0..600 (the table's check constraints). */
export function draftToInput(d: RoutineExerciseDraft, position: number, unit: WeightUnit): RoutineExerciseInput {
  const kind = draftKind(d);
  const parsedSets = intOrNull(d.sets);
  if (parsedSets == null) throw new Error(setsProblem(d));
  const sets = Math.min(20, Math.max(1, parsedSets));
  const rest = intOrNull(d.restS);
  const weight = numberOrNull(d.weight);
  return {
    exerciseId: d.exerciseId,
    position,
    targetSets: sets,
    targetReps: kind === 'weight_reps' || kind === 'reps' ? intOrNull(d.reps) : null,
    targetDurationS: kind === 'hold' || kind === 'duration' ? intOrNull(d.durationS) : null,
    targetWeightKg: kind === 'weight_reps' && weight != null ? Math.round(displayUnitToKg(weight, unit) * 100) / 100 : null,
    restS: rest == null ? null : Math.min(600, rest),
    notes: d.notes,
  };
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** First problem blocking a save, or null. */
export function validateRoutine(title: string, drafts: readonly RoutineExerciseDraft[]): string | null {
  const t = title.trim();
  if (!t) return 'Give the routine a title.';
  if (t.length > 80) return 'Keep the title to 80 characters or fewer.';
  if (drafts.length === 0) return 'Add at least one exercise.';
  for (const d of drafts) if (intOrNull(d.sets) == null) return setsProblem(d);
  return null;
}
