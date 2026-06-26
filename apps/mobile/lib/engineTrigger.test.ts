// apps/mobile/lib/engineTrigger.test.ts
import { triggerDailyEngine } from './engineTrigger';

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from './supabase';

describe('triggerDailyEngine', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns true and calls the Edge Function by name', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { ok: true }, error: null });

    const result = await triggerDailyEngine();

    expect(result).toBe(true);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-daily-engine');
  });

  test('returns false and warns (does not throw) when the Edge Function call fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const result = await triggerDailyEngine();

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
