// apps/web/lib/recommendations.test.ts
import { fetchRecommendations } from './recommendations';

// supabase-js's query builder is chainable (.from().select().in()), so the
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
});
