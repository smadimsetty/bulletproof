// apps/mobile/lib/routineDraft.test.ts
import { draftFromRoutineExercise, draftToInput, moveItem, newDraft, validateRoutine } from './routineDraft';
import type { RoutineExercise } from './routines';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

const strength = { id: 'e1', name: 'Goblet squat', exerciseType: 'strength', unilateral: false };
const hold = { id: 'e2', name: 'Couch stretch', exerciseType: 'mobility_stretch', unilateral: true };

test('newDraft picks sensible defaults per kind', () => {
  expect(newDraft(strength, 'k1')).toMatchObject({ sets: '3', durationS: '' });
  expect(newDraft(hold, 'k2')).toMatchObject({ sets: '2', durationS: '30' });
  expect(newDraft({ ...strength, defaultSets: 4 }, 'k3').sets).toBe('4');
});

test('draftToInput only keeps the targets that fit the exercise kind', () => {
  const d = { ...newDraft(strength, 'k'), sets: '4', reps: '8', weight: '100', durationS: '99', restS: '90' };
  // 100 lbs -> 45.36 kg
  expect(draftToInput(d, 2, 'lbs')).toMatchObject({ position: 2, targetSets: 4, targetReps: 8, targetDurationS: null, targetWeightKg: 45.36, restS: 90 });
  const h = { ...newDraft(hold, 'k'), reps: '12', weight: '5', durationS: '45' };
  expect(draftToInput(h, 1, 'kg')).toMatchObject({ targetReps: null, targetWeightKg: null, targetDurationS: 45 });
});

test('draftToInput clamps to the table constraints', () => {
  const d = { ...newDraft(strength, 'k'), sets: '99', restS: '9999' };
  expect(draftToInput(d, 1, 'kg')).toMatchObject({ targetSets: 20, restS: 600 });
  expect(draftToInput({ ...d, sets: '', restS: 'abc' }, 1, 'kg')).toMatchObject({ targetSets: 1, restS: null });
});

test('round trip through a routine exercise keeps display values', () => {
  const re: RoutineExercise = {
    id: 'x', exerciseId: 'e1', exerciseName: 'Goblet squat', exerciseType: 'strength', unilateral: false, position: 1,
    targetSets: 3, targetReps: 10, targetDurationS: null, targetWeightKg: 20, restS: 60, notes: 'tempo',
  };
  const d = draftFromRoutineExercise(re, 'k', 'kg');
  expect(d).toMatchObject({ sets: '3', reps: '10', weight: '20', restS: '60', notes: 'tempo' });
  expect(draftToInput(d, 1, 'kg')).toMatchObject({ targetSets: 3, targetReps: 10, targetWeightKg: 20, restS: 60, notes: 'tempo' });
});

test('moveItem swaps within bounds and ignores out-of-range moves', () => {
  expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
});

test('validateRoutine needs a title and at least one exercise', () => {
  const d = [newDraft(strength, 'k')];
  expect(validateRoutine('  ', d)).toMatch(/title/);
  expect(validateRoutine('Push', [])).toMatch(/exercise/);
  expect(validateRoutine('Push', d)).toBeNull();
});
