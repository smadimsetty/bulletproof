import { pickExerciseForSlot, slotsForDay, type PoolCandidate, type TemplateRow } from './sprintExercisePicker';

const CANDIDATES: PoolCandidate[] = [
  { exerciseId: 'ex-a', defaultRank: 1 },
  { exerciseId: 'ex-b', defaultRank: 2 },
  { exerciseId: 'ex-c', defaultRank: 3 },
];

describe('pickExerciseForSlot', () => {
  test('a single-candidate slot always returns that candidate', () => {
    const result = pickExerciseForSlot([{ exerciseId: 'only', defaultRank: 1 }], new Map());
    expect(result).toBe('only');
  });

  test('with no history, falls back to the lowest default_rank', () => {
    const result = pickExerciseForSlot(CANDIDATES, new Map());
    expect(result).toBe('ex-a');
  });

  test('a never-completed candidate outranks any completed one, regardless of rank', () => {
    const history = new Map([
      ['ex-a', '2026-09-01'],
      ['ex-b', '2026-09-10'],
      // ex-c never completed
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-c');
  });

  test('among completed candidates, the least-recently-completed one wins', () => {
    const history = new Map([
      ['ex-a', '2026-09-10'],
      ['ex-b', '2026-09-01'],
      ['ex-c', '2026-09-05'],
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-b');
  });

  test('ties in completion recency break by default_rank ascending', () => {
    const history = new Map([
      ['ex-a', '2026-09-01'],
      ['ex-b', '2026-09-01'],
      ['ex-c', '2026-09-10'],
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-a');
  });

  test('throws on an empty candidate list rather than returning undefined', () => {
    expect(() => pickExerciseForSlot([], new Map())).toThrow();
  });
});

describe('slotsForDay', () => {
  const TEMPLATE: TemplateRow[] = [
    { dayNumber: 1, slotKey: 'ankle-mobilization', tier: 1, slotOrder: 1 },
    { dayNumber: 1, slotKey: 'ankle-balance', tier: 1, slotOrder: 2 },
    { dayNumber: 2, slotKey: 'ankle-eversion-strength', tier: 2, slotOrder: 4 },
  ];

  test('returns only the rows for the requested day', () => {
    expect(slotsForDay(TEMPLATE, 1)).toEqual([
      { dayNumber: 1, slotKey: 'ankle-mobilization', tier: 1, slotOrder: 1 },
      { dayNumber: 1, slotKey: 'ankle-balance', tier: 1, slotOrder: 2 },
    ]);
  });

  test('a day with no Tier-2 slot returns just its Tier-1 rows', () => {
    expect(slotsForDay(TEMPLATE, 2)).toEqual([
      { dayNumber: 2, slotKey: 'ankle-eversion-strength', tier: 2, slotOrder: 4 },
    ]);
  });

  test('a day number with no rows at all returns an empty array', () => {
    expect(slotsForDay(TEMPLATE, 7)).toEqual([]);
  });
});
