import { firstSide, otherSidePartner, plannedRows, parseTargetSeconds, previousMatch, prefillValues, previousHint, type PreviousSet } from './previousValues';
import { EMPTY_SET_VALUES } from './setFields';

const prev = (setNumber: number, side: 'left' | 'right' | null, v: Partial<PreviousSet>): PreviousSet => ({
  ...EMPTY_SET_VALUES, setNumber, side, ...v,
});

describe('plannedRows', () => {
  test('bilateral', () => {
    expect(plannedRows(2, false)).toEqual([{ setNumber: 1, side: null }, { setNumber: 2, side: null }]);
  });
  test('sided is left then right per set', () => {
    expect(plannedRows(2, true)).toEqual([
      { setNumber: 1, side: 'left' }, { setNumber: 1, side: 'right' },
      { setNumber: 2, side: 'left' }, { setNumber: 2, side: 'right' },
    ]);
  });
  test('zero sets -> empty', () => expect(plannedRows(0, true)).toEqual([]));
  test('weaker right side leads each set and gets one extra set', () => {
    expect(plannedRows(2, true, 'right', true)).toEqual([
      { setNumber: 1, side: 'right' }, { setNumber: 1, side: 'left' },
      { setNumber: 2, side: 'right' }, { setNumber: 2, side: 'left' },
      { setNumber: 3, side: 'right' },
    ]);
  });
  test('a lead side without the extra set only reorders', () => {
    expect(plannedRows(1, true, 'right', false)).toEqual([{ setNumber: 1, side: 'right' }, { setNumber: 1, side: 'left' }]);
  });
  test('the extra set never applies to a two-sided (non-sided) exercise', () => {
    expect(plannedRows(2, false, 'left', true)).toEqual([{ setNumber: 1, side: null }, { setNumber: 2, side: null }]);
  });
});

describe('firstSide', () => {
  test('defaults to left, follows the lead side', () => {
    expect(firstSide(null)).toBe('left');
    expect(firstSide(undefined)).toBe('left');
    expect(firstSide('right')).toBe('right');
  });
});

describe('parseTargetSeconds', () => {
  test.each([
    ['30s', 30], ['30 s', 30], ['45 sec', 45], ['45 seconds', 45], ['1 min', 60], ['2 minutes', 120],
    ['60s each side', 60], ['2x30s', 30], ['2 x 30 s', 30], ['90-120s', 120],
  ])('%s -> %i', (text, s) => expect(parseTargetSeconds(text)).toBe(s));
  test.each([[null], [''], ['2x15'], ['10 reps'], ['20m']])('%s -> null', (text) => {
    expect(parseTargetSeconds(text as any)).toBeNull();
  });
});

describe('previousMatch', () => {
  const history = [prev(1, 'left', { durationS: 40 }), prev(1, 'right', { durationS: 35 }), prev(2, 'left', { durationS: 50 })];
  test('exact set number + side', () => {
    expect(previousMatch({ setNumber: 1, side: 'right' }, history)?.durationS).toBe(35);
  });
  test('falls back to highest set number on the same side', () => {
    expect(previousMatch({ setNumber: 3, side: 'left' }, history)?.durationS).toBe(50);
    expect(previousMatch({ setNumber: 3, side: 'right' }, history)?.durationS).toBe(35);
  });
  test('no same-side rows -> null', () => {
    expect(previousMatch({ setNumber: 1, side: null }, history)).toBeNull();
  });
});

describe('prefillValues', () => {
  test('copies matched values', () => {
    const v = prefillValues({ setNumber: 1, side: null }, [prev(1, null, { reps: 8, weightKg: 40 })], 'weight_reps', null);
    expect(v).toEqual({ ...EMPTY_SET_VALUES, reps: 8, weightKg: 40 });
  });
  test('hold without history uses target text', () => {
    expect(prefillValues({ setNumber: 1, side: 'left' }, [], 'hold', '45s each side').durationS).toBe(45);
  });
  test('hold without history or parseable target defaults to 30', () => {
    expect(prefillValues({ setNumber: 1, side: null }, [], 'hold', '2x15').durationS).toBe(30);
  });
  test('reps without history is blank', () => {
    expect(prefillValues({ setNumber: 1, side: null }, [], 'reps', '2x15')).toEqual(EMPTY_SET_VALUES);
  });
});

describe('previousHint', () => {
  test('formats the matched previous row', () => {
    const history = [prev(1, null, { reps: 8, weightKg: 40 })];
    expect(previousHint({ setNumber: 1, side: null }, history, 'weight_reps', 'kg')).toBe('prev: 40 kg × 8');
  });
  test('falls back to the last same-side row for an extra set', () => {
    const history = [prev(1, 'left', { durationS: 30 }), prev(2, 'left', { durationS: 45 })];
    expect(previousHint({ setNumber: 3, side: 'left' }, history, 'hold', 'lbs')).toBe('prev: 45 s');
  });
  test('null without history', () => {
    expect(previousHint({ setNumber: 1, side: null }, [], 'reps', 'lbs')).toBeNull();
  });
});

describe('otherSidePartner', () => {
  const sets = [
    { id: 'r1', setNumber: 1, side: 'right' as const, completedAt: null },
    { id: 'l1', setNumber: 1, side: 'left' as const, completedAt: null },
    { id: 'r2', setNumber: 2, side: 'right' as const, completedAt: null },
  ];
  test('after the lead side, the incomplete other side of the same set', () => {
    expect(otherSidePartner(sets, sets[0], 'right')?.id).toBe('l1');
  });
  test('the second side has no partner', () => {
    expect(otherSidePartner(sets, sets[1], 'right')).toBeNull();
  });
  test('default lead is left', () => {
    expect(otherSidePartner(sets, sets[1], null)?.id).toBe('r1');
  });
  test('the extra lead-side set has no partner', () => {
    expect(otherSidePartner(sets, sets[2], 'right')).toBeNull();
  });
});
