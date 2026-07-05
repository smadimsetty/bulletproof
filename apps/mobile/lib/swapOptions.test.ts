// apps/mobile/lib/swapOptions.test.ts
import { fetchSwapOptions } from './swapOptions';

describe('fetchSwapOptions', () => {
  test('returns only the six session types swap_activity.py/program_builder can actually build a program for', async () => {
    const groups = await fetchSwapOptions();

    const strength = groups.find((g) => g.category === 'strength');
    expect(strength?.options.map((o) => o.id)).toEqual(['upper', 'lower']);

    const cardio = groups.find((g) => g.category === 'cardio');
    expect(cardio?.options.map((o) => o.id)).toEqual(['pickleball', 'run']);

    const recovery = groups.find((g) => g.category === 'recovery');
    expect(recovery?.options.map((o) => o.id)).toEqual(['mobility', 'rest']);
  });

  test('every option has a friendly label, not a raw session_type string', async () => {
    const groups = await fetchSwapOptions();
    const allOptions = groups.flatMap((g) => g.options);

    expect(allOptions.find((o) => o.id === 'upper')?.label).toBe('Upper Body');
    expect(allOptions.find((o) => o.id === 'pickleball')?.label).toBe('Pickleball');
    expect(allOptions.find((o) => o.id === 'rest')?.label).toBe('Rest');
  });
});
