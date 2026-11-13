import {
  validatePain, validateRetest, validateStart, type CoachContext,
} from '../../../supabase/functions/sprint-coach/validate';

const ctx: CoachContext = {
  trigger: 'start',
  slotKeys: ['calf', 'balance'],
  allowedExerciseIdsBySlot: { calf: ['c1', 'c2'], balance: ['b1'] },
  maxLevelBySlot: { calf: 4, balance: 2 },
  defaultLevelBySlot: { calf: 2, balance: 1 },
  painPointIds: ['ankle', 'knees'],
};

describe('validateStart', () => {
  test('clamps start_level to default ±1 within the ladder, and drops unknown ids and slots', () => {
    const out = validateStart({
      summary: '  Calves first.  ',
      slots: [
        { slot_key: 'calf', priority_delta: 1, start_level: 5, prefer: ['c2', 'zzz'], avoid: [] },
        { slot_key: 'nope', priority_delta: 1, start_level: 1, prefer: [], avoid: [] },
        { slot_key: 'balance', priority_delta: 7, start_level: 0, prefer: [], avoid: ['b1'] },
      ],
    }, ctx)!;
    expect(out.summary).toBe('Calves first.');
    expect(out.slots).toEqual([
      { slot_key: 'calf', priority_delta: 1, start_level: 3, prefer: ['c2'], avoid: [] },
      { slot_key: 'balance', priority_delta: 1, start_level: 1, prefer: [], avoid: ['b1'] },
    ]);
  });
  test('trims a long summary to 400 characters', () => {
    expect(validateStart({ summary: 'x'.repeat(500), slots: [] }, ctx)!.summary).toHaveLength(400);
  });
  test('a non-object or wrong shape is null', () => {
    expect(validateStart('hello', ctx)).toBeNull();
    expect(validateStart(null, ctx)).toBeNull();
    expect(validateStart({ summary: 3, slots: [] }, ctx)).toBeNull();
    expect(validateStart({ summary: 'ok', slots: 'no' }, ctx)).toBeNull();
  });
});

describe('validatePain', () => {
  test('a raise is clamped to the current level; lowering is kept; floor is 1', () => {
    const out = validatePain({
      slots: [
        { slot_key: 'calf', level: 4, prefer: [], avoid: ['c1'], note: 'n' },
        { slot_key: 'balance', level: -2, prefer: [], avoid: [], note: '' },
      ],
    }, { ...ctx, trigger: 'pain' }, { calf: 2, balance: 1 })!;
    expect(out.slots.map((s) => [s.slot_key, s.level])).toEqual([['calf', 2], ['balance', 1]]);
    expect(out.slots[0].avoid).toEqual(['c1']);
  });
  test('notes are trimmed to 160 characters', () => {
    const out = validatePain({ slots: [{ slot_key: 'calf', level: 1, prefer: [], avoid: [], note: 'y'.repeat(300) }] },
      { ...ctx, trigger: 'pain' }, { calf: 2 })!;
    expect(out.slots[0].note).toHaveLength(160);
  });
  test('wrong shape is null', () => {
    expect(validatePain([], { ...ctx, trigger: 'pain' }, {})).toBeNull();
  });
});

describe('validateRetest', () => {
  test('an unknown suggested pain point becomes null', () => {
    expect(validateRetest({ choice: 'switch', reason: 'r', suggested_pain_point_id: 'mars' }, ctx))
      .toEqual({ choice: 'switch', reason: 'r', suggested_pain_point_id: null });
  });
  test('a known suggestion is kept on switch, dropped on stay', () => {
    expect(validateRetest({ choice: 'switch', reason: 'r', suggested_pain_point_id: 'knees' }, ctx)!.suggested_pain_point_id).toBe('knees');
    expect(validateRetest({ choice: 'stay', reason: 'r', suggested_pain_point_id: 'knees' }, ctx)!.suggested_pain_point_id).toBeNull();
  });
  test('an unknown choice or non-object is null', () => {
    expect(validateRetest({ choice: 'maybe', reason: 'r', suggested_pain_point_id: null }, ctx)).toBeNull();
    expect(validateRetest(42, ctx)).toBeNull();
  });
});
