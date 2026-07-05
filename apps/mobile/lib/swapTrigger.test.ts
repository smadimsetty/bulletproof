// apps/mobile/lib/swapTrigger.test.ts
import { triggerSwapActivity } from './swapTrigger';

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from './supabase';

describe('triggerSwapActivity', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns true and calls the Edge Function with date/activity', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { ok: true }, error: null });

    const result = await triggerSwapActivity('2026-07-05', 'pickleball');

    expect(result).toBe(true);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-swap-activity', {
      body: { date: '2026-07-05', activity: 'pickleball' },
    });
  });

  test('returns false and warns (does not throw) when the Edge Function call fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const result = await triggerSwapActivity('2026-07-05', 'rest');

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
