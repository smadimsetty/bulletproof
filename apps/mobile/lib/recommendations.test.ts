// apps/mobile/lib/recommendations.test.ts
import { fetchRecommendations } from './recommendations';

// `supabase-js`'s query builder is chainable (.from().select().in()), so the
// mock needs to return an object whose `.in(...)` resolves to the desired
// `{ data, error }` shape -- mirroring how the real client resolves a
// terminal query call.
jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

function mockSupabaseResponse(data: unknown, error: unknown = null) {
  const inFn = jest.fn().mockResolvedValue({ data, error });
  const selectFn = jest.fn().mockReturnValue({ in: inFn });
  (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });
  return { selectFn, inFn };
}

const TODAY = new Date('2026-06-22T12:00:00Z');
const TODAY_ISO = '2026-06-22';
const YESTERDAY_ISO = '2026-06-21';

const todayRow = {
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper_a',
  public_rationale: "Today's pick is mobility -- a mobility session was overdue. Runner-up: upper a.",
  generated_at: '2026-06-22T11:00:05Z',
};

const yesterdayRow = {
  date: YESTERDAY_ISO,
  top_pick: 'lower_a',
  runner_up: null,
  public_rationale: "Today's pick is lower a -- this keeps your training balanced this week.",
  generated_at: '2026-06-21T11:00:04Z',
};

describe('fetchRecommendations', () => {
  test('returns both rows when both exist', async () => {
    mockSupabaseResponse([todayRow, yesterdayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toEqual(todayRow);
    expect(result.yesterday).toEqual(yesterdayRow);
  });

  test('returns only today when yesterday has no row', async () => {
    mockSupabaseResponse([todayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toEqual(todayRow);
    expect(result.yesterday).toBeNull();
  });

  test('returns only yesterday when today has not generated yet', async () => {
    mockSupabaseResponse([yesterdayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toBeNull();
    expect(result.yesterday).toEqual(yesterdayRow);
  });

  test('returns both null when neither row exists', async () => {
    mockSupabaseResponse([]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toBeNull();
    expect(result.yesterday).toBeNull();
  });

  test('queries recommendations_public with exactly the public columns and both dates', async () => {
    const { selectFn, inFn } = mockSupabaseResponse([todayRow, yesterdayRow]);

    await fetchRecommendations(TODAY);

    expect(supabase.from).toHaveBeenCalledWith('recommendations_public');
    expect(selectFn).toHaveBeenCalledWith(
      'date, top_pick, runner_up, public_rationale, generated_at'
    );
    expect(inFn).toHaveBeenCalledWith('date', [TODAY_ISO, YESTERDAY_ISO]);
  });

  test('throws if the query returns an error', async () => {
    mockSupabaseResponse(null, { message: 'network down' });

    await expect(fetchRecommendations(TODAY)).rejects.toThrow('network down');
  });

  // Regression test for the UTC/local-date bug: a fixed midday-UTC timestamp
  // (like TODAY above) never crosses the UTC day boundary, so it can't catch
  // a helper that derives the date via toISOString() instead of local date
  // parts. This test instead builds "today" from local components late in
  // the evening -- a time of day guaranteed to roll over to the *next* UTC
  // calendar date in any timezone west of UTC (and plenty east of it too),
  // which is exactly the scenario the plan's Global Constraints call out.
  test('queries by local calendar date, not UTC date, near the UTC day boundary', async () => {
    // 11:30pm local time -- in any timezone with a negative UTC offset
    // (e.g. US timezones), this instant's UTC date is already the next day.
    const localEvening = new Date(2026, 5, 22, 23, 30, 0); // 2026-06-22 23:30 local
    const localEveningYesterday = new Date(2026, 5, 21, 23, 30, 0); // 2026-06-21 23:30 local

    const buggyUtcToday = localEvening.toISOString().slice(0, 10);
    const buggyUtcYesterday = localEveningYesterday.toISOString().slice(0, 10);

    // Sanity check: this test only proves anything if the buggy UTC-based
    // computation actually disagrees with the local date for this instant.
    // If the test machine's TZ has zero/positive offset such that no
    // divergence occurs at 23:30 local, skip the assertion meaningfully by
    // failing loudly instead of silently passing.
    const localOffsetMinutes = localEvening.getTimezoneOffset();
    expect(localOffsetMinutes).toBeGreaterThan(0); // i.e. west of UTC, so divergence is guaranteed
    expect(buggyUtcToday).not.toBe('2026-06-22');
    expect(buggyUtcYesterday).not.toBe('2026-06-21');

    const { inFn } = mockSupabaseResponse([]);

    await fetchRecommendations(localEvening);

    // The fix must use the *local* calendar date ('2026-06-22' /
    // '2026-06-21'), not the UTC-rolled-forward date the old
    // toIsoDate(d.toISOString().slice(0, 10)) helper would have produced.
    expect(inFn).toHaveBeenCalledWith('date', ['2026-06-22', '2026-06-21']);
    expect(inFn).not.toHaveBeenCalledWith('date', [buggyUtcToday, buggyUtcYesterday]);
  });
});
