import { pickOneOffSlots, type OneOffPoolRow } from './focusSwap';
import type { TemplateRow } from './sprintExercisePicker';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./sprintLifecycle', () => ({ fetchLastCompletedByExerciseId: jest.fn() }));
jest.mock('./userSettings', () => ({ fetchUserSettings: jest.fn() }));
jest.mock('./workouts', () => ({ addExercisesToWorkout: jest.fn(), startWorkout: jest.fn() }));

const TEMPLATE: TemplateRow[] = [
  { dayNumber: 3, slotKey: 'b', tier: 2, slotOrder: 2 },
  { dayNumber: 3, slotKey: 'a', tier: 1, slotOrder: 1 },
  { dayNumber: 4, slotKey: 'a', tier: 1, slotOrder: 1 },
];
const row = (slotKey: string, exerciseId: string, defaultRank: number, equipment: string[] | null = null): OneOffPoolRow => ({
  slotKey, exerciseId, defaultRank, prescribedSets: 2, prescribedRepsOrDuration: '30s', equipment,
});

describe('pickOneOffSlots', () => {
  test('one exercise per slot of that day, in slot_order', () => {
    const pool = [row('a', 'a1', 1), row('a', 'a2', 2), row('b', 'b1', 1)];
    const out = pickOneOffSlots(TEMPLATE, pool, 3, null, new Map());
    expect(out.map((o) => o.exerciseId)).toEqual(['a1', 'b1']);
    expect(out[0]).toEqual({ exerciseId: 'a1', sets: 2, repsOrDuration: '30s' });
  });

  test('empty history picks lowest default_rank', () => {
    const pool = [row('a', 'a2', 5), row('a', 'a1', 1), row('b', 'b1', 1)];
    expect(pickOneOffSlots(TEMPLATE, pool, 3, null, new Map())[0].exerciseId).toBe('a1');
  });

  test('prefers the least recently completed', () => {
    const pool = [row('a', 'a1', 1), row('a', 'a2', 2), row('b', 'b1', 1)];
    const out = pickOneOffSlots(TEMPLATE, pool, 3, null, new Map([['a1', '2026-11-01']]));
    expect(out[0].exerciseId).toBe('a2');
  });

  test('respects equipment tier', () => {
    const pool = [row('a', 'a1', 1, ['barbell']), row('a', 'a2', 2, ['none']), row('b', 'b1', 1)];
    const out = pickOneOffSlots(TEMPLATE, pool, 3, 'basic', new Map());
    expect(out[0].exerciseId).toBe('a2');
  });

  test('skips slots with no pool and ignores other days', () => {
    expect(pickOneOffSlots(TEMPLATE, [row('a', 'a1', 1)], 3, null, new Map()).map((o) => o.exerciseId)).toEqual(['a1']);
    expect(pickOneOffSlots(TEMPLATE, [row('a', 'a1', 1)], 9, null, new Map())).toEqual([]);
  });
});
