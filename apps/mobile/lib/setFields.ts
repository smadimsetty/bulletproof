//
// Which inputs a logged set shows, decided by the exercise's
// exercise_type (spec section 3). Pure -- no Supabase, no RN.
export type SetKind = 'weight_reps' | 'reps' | 'hold' | 'duration';
export type RomUnit = 'cm' | 'deg' | 'in';
export type Side = 'left' | 'right' | null;

export interface SetFieldSpec {
  readonly kind: SetKind;
  readonly sided: boolean;
}

export interface SetValues {
  readonly reps: number | null;
  readonly weightKg: number | null;
  readonly durationS: number | null;
  readonly romValue: number | null;
  readonly romUnit: RomUnit | null;
}

export const EMPTY_SET_VALUES: SetValues = { reps: null, weightKg: null, durationS: null, romValue: null, romUnit: null };

const KIND_BY_TYPE: Record<string, SetKind> = {
  strength: 'weight_reps',
  plyometric: 'reps',
  mobility_stretch: 'hold',
  balance: 'hold',
  cardio: 'duration',
};

export function fieldsForExercise(input: { exerciseType: string | null; unilateral: boolean }): SetFieldSpec {
  const kind = (input.exerciseType && KIND_BY_TYPE[input.exerciseType]) || 'reps';
  return { kind, sided: input.unilateral };
}

const FALLBACK_SET_COUNT: Record<SetKind, number> = { weight_reps: 3, reps: 3, hold: 2, duration: 1 };

export function defaultSetCount(kind: SetKind, prescribedSets: number | null, defaultSets: number | null): number {
  if (prescribedSets != null && prescribedSets > 0) return prescribedSets;
  if (defaultSets != null && defaultSets > 0) return defaultSets;
  return FALLBACK_SET_COUNT[kind];
}

export function defaultRestSeconds(kind: SetKind): number {
  return kind === 'weight_reps' || kind === 'reps' ? 60 : 30;
}

export function missingRequiredField(kind: SetKind, values: SetValues): string | null {
  if (kind === 'reps' || kind === 'weight_reps') {
    return values.reps == null ? 'Enter reps' : null;
  }
  return values.durationS == null || values.durationS <= 0 ? 'Enter a duration' : null;
}
