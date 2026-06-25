import { rangeDays, dateRangeBounds, isoWeekStart, type TimeRange } from './trendsRange';

describe('rangeDays', () => {
  test.each<[TimeRange, number]>([
    ['week', 7],
    ['month', 30],
    ['6mo', 182],
    ['year', 365],
  ])('%s maps to %d days', (range, days) => {
    expect(rangeDays(range)).toBe(days);
  });
});

describe('dateRangeBounds', () => {
  test('returns [today - N days, today] inclusive as local date strings', () => {
    const today = new Date(2026, 5, 25); // June 25, 2026 (month is 0-indexed)
    const bounds = dateRangeBounds('week', today);
    expect(bounds).toEqual({ startDate: '2026-06-18', endDate: '2026-06-25' });
  });

  test('month range spans 30 days back', () => {
    const today = new Date(2026, 5, 25);
    const bounds = dateRangeBounds('month', today);
    expect(bounds).toEqual({ startDate: '2026-05-26', endDate: '2026-06-25' });
  });

  test('handles a year boundary correctly', () => {
    const today = new Date(2026, 0, 3); // Jan 3, 2026
    const bounds = dateRangeBounds('week', today);
    expect(bounds).toEqual({ startDate: '2025-12-27', endDate: '2026-01-03' });
  });
});

describe('isoWeekStart', () => {
  test('a Wednesday maps back to the prior Monday', () => {
    expect(isoWeekStart('2026-06-24')).toBe('2026-06-22'); // 2026-06-24 is a Wednesday
  });

  test('a Monday maps to itself', () => {
    expect(isoWeekStart('2026-06-22')).toBe('2026-06-22');
  });

  test('a Sunday maps back to the same week\'s Monday', () => {
    expect(isoWeekStart('2026-06-28')).toBe('2026-06-22'); // 2026-06-28 is a Sunday
  });
});
