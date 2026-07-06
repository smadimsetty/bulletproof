// apps/mobile/lib/swapOptions.test.ts
import { daysSinceByType, fetchSwapOptions } from './swapOptions';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const TODAY = new Date(2026, 6, 5, 12, 0, 0); // 2026-07-05 local noon
const TODAY_ISO = '2026-07-05';

function installSessionsMock(rows: ReadonlyArray<{ date: string; type: string }>) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table !== 'sessions') {
      throw new Error(`unexpected table in test: ${table}`);
    }
    const chain: any = {
      select: jest.fn(() => chain),
      gte: jest.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    return chain;
  });
}

describe('daysSinceByType', () => {
  test('computes days since the most recent session of each type', () => {
    const sessions = [
      { date: '2026-06-18', type: 'upper' },
      { date: '2026-06-20', type: 'lower' },
      { date: '2026-06-15', type: 'pickleball' },
      { date: '2026-06-12', type: 'run' },
      { date: '2026-06-19', type: 'rest' },
      { date: '2026-06-25', type: 'mobility' },
    ];

    const result = daysSinceByType(sessions, TODAY_ISO);

    expect(result.upper).toBe(17);
    expect(result.lower).toBe(15);
    expect(result.pickleball).toBe(20);
    expect(result.run).toBe(23);
    expect(result.rest).toBe(16);
    expect(result.mobility).toBe(10);
  });

  test('uses only the most recent session when a type appears more than once', () => {
    const sessions = [
      { date: '2026-06-13', type: 'rest' },
      { date: '2026-06-19', type: 'rest' },
      { date: '2026-06-16', type: 'rest' },
    ];

    const result = daysSinceByType(sessions, TODAY_ISO);

    expect(result.rest).toBe(16);
  });

  test('a never-logged type gets a large sentinel so it ranks as most overdue', () => {
    const result = daysSinceByType([], TODAY_ISO);

    expect(result.upper).toBeGreaterThan(365);
    expect(result.rest).toBeGreaterThan(365);
  });
});

describe('fetchSwapOptions', () => {
  test('returns only the six session types swap_activity.py/program_builder can actually build a program for', async () => {
    installSessionsMock([]);
    const groups = await fetchSwapOptions(TODAY);

    const strength = groups.find((g) => g.category === 'strength');
    expect(strength?.options.map((o) => o.id).sort()).toEqual(['lower', 'upper']);

    const cardio = groups.find((g) => g.category === 'cardio');
    expect(cardio?.options.map((o) => o.id).sort()).toEqual(['pickleball', 'run']);

    const recovery = groups.find((g) => g.category === 'recovery');
    expect(recovery?.options.map((o) => o.id).sort()).toEqual(['mobility', 'rest']);
  });

  test('every option has a friendly label, not a raw session_type string', async () => {
    installSessionsMock([]);
    const groups = await fetchSwapOptions(TODAY);
    const allOptions = groups.flatMap((g) => g.options);

    expect(allOptions.find((o) => o.id === 'upper')?.label).toBe('Upper Body');
    expect(allOptions.find((o) => o.id === 'pickleball')?.label).toBe('Pickleball');
    expect(allOptions.find((o) => o.id === 'rest')?.label).toBe('Rest');
  });

  test('ranks each group\'s options by days since last done, most overdue first', async () => {
    installSessionsMock([
      { date: '2026-06-18', type: 'upper' }, // 17 days ago
      { date: '2026-06-20', type: 'lower' }, // 15 days ago
      { date: '2026-06-15', type: 'pickleball' }, // 20 days ago
      { date: '2026-06-12', type: 'run' }, // 23 days ago
      { date: '2026-06-19', type: 'rest' }, // 16 days ago
      { date: '2026-06-25', type: 'mobility' }, // 10 days ago
    ]);

    const groups = await fetchSwapOptions(TODAY);

    const strength = groups.find((g) => g.category === 'strength');
    expect(strength?.options.map((o) => o.id)).toEqual(['upper', 'lower']);

    const cardio = groups.find((g) => g.category === 'cardio');
    expect(cardio?.options.map((o) => o.id)).toEqual(['run', 'pickleball']);

    const recovery = groups.find((g) => g.category === 'recovery');
    expect(recovery?.options.map((o) => o.id)).toEqual(['rest', 'mobility']);
  });

  test('a type never logged before ranks ahead of one logged recently', async () => {
    installSessionsMock([{ date: '2026-07-04', type: 'upper' }]); // 1 day ago, lower never logged

    const groups = await fetchSwapOptions(TODAY);
    const strength = groups.find((g) => g.category === 'strength');

    expect(strength?.options.map((o) => o.id)).toEqual(['lower', 'upper']);
  });
});
