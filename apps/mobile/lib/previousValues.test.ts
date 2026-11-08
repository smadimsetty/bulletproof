import { plannedRows, parseTargetSeconds, previousMatch, prefillValues, type PreviousSet } from './previousValues';
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
