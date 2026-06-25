// apps/mobile/lib/dailyFeedback.test.ts
import { submitDailyFeedback } from './dailyFeedback';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

function mockInsert(response: { error: unknown }) {
  const insertFn = jest.fn().mockResolvedValue(response);
  (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });
  return insertFn;
}

const TODAY = new Date(2026, 5, 24, 20, 0, 0); // 2026-06-24 local evening
const TODAY_ISO = '2026-06-24';

describe('submitDailyFeedback', () => {
  test('inserts a row with today\'s local date and the trimmed feedback text', async () => {
    const insertFn = mockInsert({ error: null });

    await submitDailyFeedback(TODAY, '  Felt great today, ankles loose.  ');

    expect(supabase.from).toHaveBeenCalledWith('daily_feedback');
    expect(insertFn).toHaveBeenCalledWith({
      date: TODAY_ISO,
      feedback_text: 'Felt great today, ankles loose.',
    });
  });

  test('throws if the insert returns an error', async () => {
    mockInsert({ error: { message: 'network down' } });

    await expect(submitDailyFeedback(TODAY, 'note')).rejects.toThrow('network down');
  });

  test('throws on empty/whitespace-only feedback without calling Supabase', async () => {
    const insertFn = mockInsert({ error: null });

    await expect(submitDailyFeedback(TODAY, '   ')).rejects.toThrow('Feedback cannot be empty');
    expect(insertFn).not.toHaveBeenCalled();
  });
});
