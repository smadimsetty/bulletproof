import { mergeSleepAndTrainingHistory, fetchSleepAndTrainingHistory } from './trendsHistory';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from './supabase';

describe('mergeSleepAndTrainingHistory', () => {
  const bounds = { startDate: '2026-06-22', endDate: '2026-06-25' };

  test('fills every date in range, with nulls where there is no data', () => {
    const result = mergeSleepAndTrainingHistory(
      bounds,
      [{ date: '2026-06-23', sleep_hrs: 7.5 }],
      [{ date: '2026-06-24', type: 'upper' }]
    );

    expect(result).toEqual([
      { date: '2026-06-22', sleepHrs: null, sessionType: null },
      { date: '2026-06-23', sleepHrs: 7.5, sessionType: null },
      { date: '2026-06-24', sleepHrs: null, sessionType: 'upper' },
      { date: '2026-06-25', sleepHrs: null, sessionType: null },
    ]);
  });

  test('when a date has more than one session row, the first one wins', () => {
    const result = mergeSleepAndTrainingHistory(
      bounds,
      [],
      [
        { date: '2026-06-22', type: 'pickleball' },
        { date: '2026-06-22', type: 'mobility' },
      ]
    );

    expect(result[0].sessionType).toBe('pickleball');
  });

  test('returns an empty-but-complete-dates array when both sources are empty', () => {
    const result = mergeSleepAndTrainingHistory(bounds, [], []);
    expect(result).toHaveLength(4);
    expect(result.every((point) => point.sleepHrs === null && point.sessionType === null)).toBe(true);
  });
});

describe('fetchSleepAndTrainingHistory', () => {
  test('queries both recovery and sessions scoped to the date range and merges them', async () => {
    const recoveryLte = jest.fn().mockResolvedValue({
      data: [{ date: '2026-06-23', sleep_hrs: 6.8 }],
      error: null,
    });
    const recoveryGte = jest.fn(() => ({ lte: recoveryLte }));
    const sessionsLte = jest.fn().mockResolvedValue({
      data: [{ date: '2026-06-23', type: 'lower' }],
      error: null,
    });
    const sessionsGte = jest.fn(() => ({ lte: sessionsLte }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'recovery') {
        return { select: jest.fn(() => ({ gte: recoveryGte })) };
      }
      if (table === 'sessions') {
        return { select: jest.fn(() => ({ gte: sessionsGte })) };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchSleepAndTrainingHistory({ startDate: '2026-06-23', endDate: '2026-06-23' });

    expect(result).toEqual([{ date: '2026-06-23', sleepHrs: 6.8, sessionType: 'lower' }]);
    expect(recoveryGte).toHaveBeenCalledWith('date', '2026-06-23');
    expect(recoveryLte).toHaveBeenCalledWith('date', '2026-06-23');
    expect(sessionsGte).toHaveBeenCalledWith('date', '2026-06-23');
    expect(sessionsLte).toHaveBeenCalledWith('date', '2026-06-23');
  });

  test('throws if either query returns an error', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'recovery') {
        return {
          select: jest.fn(() => ({
            gte: jest.fn(() => ({ lte: jest.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          gte: jest.fn(() => ({ lte: jest.fn().mockResolvedValue({ data: [], error: null }) })),
        })),
      };
    });

    await expect(
      fetchSleepAndTrainingHistory({ startDate: '2026-06-23', endDate: '2026-06-23' })
    ).rejects.toThrow('down');
  });
});
