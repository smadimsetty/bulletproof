import { fieldsForExercise, defaultSetCount, defaultRestSeconds, missingRequiredField, sameSetValues, EMPTY_SET_VALUES } from './setFields';

describe('fieldsForExercise', () => {
  test.each([
    ['strength', 'weight_reps'],
    ['plyometric', 'reps'],
    ['mobility_stretch', 'hold'],
    ['balance', 'hold'],
    ['cardio', 'duration'],
    [null, 'reps'],
    ['something_new', 'reps'],
  ])('%s -> %s', (type, kind) => {
    expect(fieldsForExercise({ exerciseType: type as any, unilateral: false })).toEqual({ kind, sided: false });
  });
  test('sided follows unilateral', () => {
    expect(fieldsForExercise({ exerciseType: 'balance', unilateral: true }).sided).toBe(true);
  });
});

describe('defaultSetCount', () => {
  test('prescribed wins', () => expect(defaultSetCount('hold', 4, 2)).toBe(4));
  test('then exercise default', () => expect(defaultSetCount('hold', null, 5)).toBe(5));
  test('ignores non-positive values', () => expect(defaultSetCount('reps', 0, 0)).toBe(3));
  test.each([['weight_reps', 3], ['reps', 3], ['hold', 2], ['duration', 1]])('%s fallback %i', (k, n) => {
    expect(defaultSetCount(k as any, null, null)).toBe(n);
  });
});

describe('defaultRestSeconds', () => {
  test.each([['weight_reps', 60], ['reps', 60], ['hold', 30], ['duration', 30]])('%s -> %i', (k, s) => {
    expect(defaultRestSeconds(k as any)).toBe(s);
  });
});

describe('missingRequiredField', () => {
  test('reps required for reps and weight_reps', () => {
    expect(missingRequiredField('reps', EMPTY_SET_VALUES)).toBe('Enter reps');
    expect(missingRequiredField('weight_reps', EMPTY_SET_VALUES)).toBe('Enter reps');
    expect(missingRequiredField('weight_reps', { ...EMPTY_SET_VALUES, reps: 8 })).toBeNull();
  });
  test('weight is optional (bodyweight)', () => {
    expect(missingRequiredField('weight_reps', { ...EMPTY_SET_VALUES, reps: 0 })).toBeNull();
  });
  test('duration required for hold and duration', () => {
    expect(missingRequiredField('hold', EMPTY_SET_VALUES)).toBe('Enter a duration');
    expect(missingRequiredField('duration', { ...EMPTY_SET_VALUES, durationS: 0 })).toBe('Enter a duration');
    expect(missingRequiredField('hold', { ...EMPTY_SET_VALUES, durationS: 30 })).toBeNull();
  });
});

describe('sameSetValues', () => {
  test('equal bundles', () => {
    expect(sameSetValues({ ...EMPTY_SET_VALUES, reps: 8, weightKg: 61.2349 }, { ...EMPTY_SET_VALUES, reps: 8, weightKg: 61.23 })).toBe(true);
  });
  test('any changed field differs', () => {
    const base = { ...EMPTY_SET_VALUES, reps: 8, weightKg: 40, romValue: 10, romUnit: 'cm' as const };
    expect(sameSetValues(base, { ...base, reps: 10 })).toBe(false);
    expect(sameSetValues(base, { ...base, weightKg: 42.5 })).toBe(false);
    expect(sameSetValues(base, { ...base, weightKg: null })).toBe(false);
    expect(sameSetValues(base, { ...base, romUnit: 'deg' })).toBe(false);
    expect(sameSetValues(base, { ...base, durationS: 30 })).toBe(false);
  });
});
