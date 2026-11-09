// apps/mobile/lib/stats/consistency.test.ts
//
// Timezone-robust by construction: every timestamp is built from LOCAL
// components (new Date(y, m, d, h, mi).toISOString()), so expectations hold
// whatever TZ the test runner uses -- including the "late Sunday local /
// Monday UTC" case, which arises for 23:30 local in any zone behind UTC.
import { computeConsistency, localDay, localWeekStart, monthGrid } from './consistency';

const at = (y: number, m1: number, d: number, h = 12, mi = 0) => new Date(y, m1 - 1, d, h, mi).toISOString();

test('localWeekStart of a Sunday is the previous Monday', () => {
  expect(localWeekStart(new Date(2026, 10, 8))).toBe('2026-11-02'); // Sun Nov 8
  expect(localWeekStart(new Date(2026, 10, 2))).toBe('2026-11-02'); // Mon
});

test('localDay uses local time', () => {
  expect(localDay(at(2026, 11, 8, 23, 30))).toBe('2026-11-08');
});

describe('computeConsistency', () => {
  const now = new Date(2026, 10, 11, 9); // Wed Nov 11, week of Nov 9
  const week = (mondayDay: number, month1: number, n: number) =>
    Array.from({ length: n }, (_, i) => at(2026, month1, mondayDay + i));

  test('unfinished current week below goal does not break the streak', () => {
    const ends = [...week(19, 10, 3), ...week(26, 10, 3), ...week(2, 11, 3), ...week(9, 11, 1)];
    const c = computeConsistency(ends, 3, now);
    expect(c.currentStreak).toBe(3);
    expect(c.thisWeekCount).toBe(1);
    expect(c.weeklyGoal).toBe(3);
  });

  test('current week met extends the streak', () => {
    const ends = [...week(19, 10, 3), ...week(26, 10, 3), ...week(2, 11, 3), ...week(9, 11, 3)];
    expect(computeConsistency(ends, 3, now).currentStreak).toBe(4);
  });

  test('a gap resets current but best keeps the max', () => {
    // Met: Oct 12 and Oct 19 (run of 2), gap Oct 26, met Nov 2 (run of 1).
    const ends = [...week(12, 10, 3), ...week(19, 10, 3), ...week(2, 11, 3)];
    const c = computeConsistency(ends, 3, now);
    expect(c.currentStreak).toBe(1);
    expect(c.bestStreak).toBe(2);
  });

  test('empty input is all zeros', () => {
    expect(computeConsistency([], 3, now)).toEqual({ currentStreak: 0, bestStreak: 0, thisWeekCount: 0, weeklyGoal: 3 });
  });

  test("late Sunday local counts in that Sunday's week", () => {
    const c = computeConsistency([at(2026, 11, 8, 23, 30)], 1, new Date(2026, 10, 8, 23, 45));
    expect(c.thisWeekCount).toBe(1);
    expect(c.currentStreak).toBe(1);
  });
});

describe('monthGrid', () => {
  const now = new Date(2026, 10, 8, 10);

  test('Nov 2026 starts Mon Oct 26 and has 6 rows (Nov 30 is a Monday)', () => {
    const grid = monthGrid(2026, 10, [], now);
    expect(grid).toHaveLength(6);
    expect(grid[0][0]).toMatchObject({ date: '2026-10-26', inMonth: false });
    expect(grid[0][6]).toMatchObject({ date: '2026-11-01', inMonth: true });
    expect(grid[4][6]).toMatchObject({ date: '2026-11-29', inMonth: true });
    expect(grid[5][0]).toMatchObject({ date: '2026-11-30', inMonth: true });
  });

  test('late-Sunday workout lands on Nov 8; sprint flag and today set', () => {
    const grid = monthGrid(2026, 10, [{ endedAt: at(2026, 11, 8, 23, 30), isSprint: true }], now);
    const cell = grid.flat().find((d) => d.date === '2026-11-08')!;
    expect(cell).toMatchObject({ count: 1, hasSprint: true, isToday: true });
    expect(grid.flat().filter((d) => d.count > 0)).toHaveLength(1);
  });
});
