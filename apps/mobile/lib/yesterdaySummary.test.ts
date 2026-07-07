// apps/mobile/lib/yesterdaySummary.test.ts
import {
  buildYesterdayInsightLine,
  buildYesterdaySummaryMessage,
  fetchYesterdaySummaryMessage,
  type YesterdayActivity,
  type YesterdaySleep,
} from './yesterdaySummary';

describe('buildYesterdayInsightLine', () => {
  const noActivity: YesterdayActivity = { description: null };
  const hadActivity: YesterdayActivity = { description: 'Pickleball' };

  test('no sleep data -> no insight', () => {
    expect(buildYesterdayInsightLine({ hours: null, source: null }, noActivity)).toBeNull();
  });

  test('good sleep + no activity -> push-hard insight', () => {
    const sleep: YesterdaySleep = { hours: 7.5, source: 'healthkit' };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBe(
      'Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('good sleep + had activity -> no push-hard insight (already an active day)', () => {
    const sleep: YesterdaySleep = { hours: 7.5, source: 'healthkit' };
    expect(buildYesterdayInsightLine(sleep, hadActivity)).toBeNull();
  });

  test('low sleep -> ease-up insight regardless of activity', () => {
    const sleep: YesterdaySleep = { hours: 5.5, source: 'oura' };
    expect(buildYesterdayInsightLine(sleep, hadActivity)).toBe(
      'Short on sleep last night — consider easing up today.'
    );
  });

  test('sleep exactly at the low threshold does not trigger the ease-up insight', () => {
    const sleep: YesterdaySleep = { hours: 6, source: 'oura' };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBeNull();
  });

  test('sleep exactly at the good threshold with no activity triggers push-hard', () => {
    const sleep: YesterdaySleep = { hours: 7, source: 'oura' };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBe(
      'Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('mid-range sleep with no activity -> no insight either way', () => {
    const sleep: YesterdaySleep = { hours: 6.5, source: 'oura' };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBeNull();
  });
});

describe('buildYesterdaySummaryMessage', () => {
  const noSleep: YesterdaySleep = { hours: null, source: null };
  const noActivity: YesterdayActivity = { description: null };

  test('sleep only (oura), mid-range hours -> describes sleep with no source qualifier, no insight', () => {
    const sleep: YesterdaySleep = { hours: 6.5, source: 'oura' };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe('Slept 6.5h last night.');
  });

  test('sleep only (healthkit), mid-range hours -> describes sleep with an Apple Health qualifier', () => {
    const sleep: YesterdaySleep = { hours: 6.8, source: 'healthkit' };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 6.8h last night (via Apple Health).'
    );
  });

  test('activity only -> describes activity', () => {
    const activity: YesterdayActivity = { description: 'Pickleball' };
    expect(buildYesterdaySummaryMessage(noSleep, activity)).toBe('You did Pickleball yesterday.');
  });

  test('both sleep and activity, mid-range hours -> combines both into one message', () => {
    const sleep: YesterdaySleep = { hours: 6.5, source: 'oura' };
    const activity: YesterdayActivity = { description: 'Lower Body' };
    expect(buildYesterdaySummaryMessage(sleep, activity)).toBe(
      'Slept 6.5h last night. You did Lower Body yesterday.'
    );
  });

  test('both, with a healthkit sleep source -> qualifier included alongside activity', () => {
    const sleep: YesterdaySleep = { hours: 6.8, source: 'healthkit' };
    const activity: YesterdayActivity = { description: 'Run' };
    expect(buildYesterdaySummaryMessage(sleep, activity)).toBe(
      'Slept 6.8h last night (via Apple Health). You did Run yesterday.'
    );
  });

  test('neither -> honest no-data message', () => {
    expect(buildYesterdaySummaryMessage(noSleep, noActivity)).toBe('No data from yesterday.');
  });

  test('good sleep + no activity -> sleep sentence plus push-hard insight', () => {
    const sleep: YesterdaySleep = { hours: 7.2, source: 'oura' };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 7.2h last night. Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('sleep hours of exactly 0 still counts as real sleep data and triggers the ease-up insight', () => {
    const sleep: YesterdaySleep = { hours: 0, source: 'oura' };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 0.0h last night. Short on sleep last night — consider easing up today.'
    );
  });

  test('rounds sleep hours to one decimal place', () => {
    const sleep: YesterdaySleep = { hours: 6.166666, source: 'oura' };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe('Slept 6.2h last night.');
  });
});

// supabase-js's query builder is chainable; this mock provides a minimal
// per-table chain, mirroring homeProgram.test.ts's existing convention.
jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('./healthkitSync', () => ({
  fetchHealthKitSleepHoursForDate: jest.fn(),
  isHealthKitSyncEnabled: jest.fn(),
}));

import { supabase } from './supabase';
import { fetchHealthKitSleepHoursForDate, isHealthKitSyncEnabled } from './healthkitSync';

const TODAY = new Date(2026, 5, 24, 12, 0, 0); // 2026-06-24 local noon
const YESTERDAY_ISO = '2026-06-23';

function installSupabaseMock(config: {
  recovery?: { data: unknown; error: unknown };
  sessions?: { data: unknown; error: unknown };
  activity?: { data: unknown; error: unknown };
}) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'recovery') {
      const response = config.recovery ?? { data: null, error: null };
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve(response)),
      };
      return chain;
    }
    if (table === 'sessions') {
      const response = config.sessions ?? { data: [], error: null };
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => Promise.resolve(response)),
      };
      return chain;
    }
    if (table === 'activity') {
      const response = config.activity ?? { data: null, error: null };
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve(response)),
      };
      return chain;
    }
    throw new Error(`unexpected table in test: ${table}`);
  });
}

describe('fetchYesterdaySummaryMessage', () => {
  beforeEach(() => {
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockReset();
    // Default: HealthKit sync off, so tests not focused on the HealthKit
    // path exercise the Oura fallback exactly like before this feature.
    (isHealthKitSyncEnabled as jest.Mock).mockReset().mockResolvedValue(false);
  });

  test('prefers HealthKit sleep over Oura when sync is enabled and HealthKit has data', async () => {
    installSupabaseMock({
      recovery: { data: { sleep_hrs: 8 }, error: null },
      sessions: { data: [{ type: 'lower', felt_rating: 4 }], error: null },
    });
    (isHealthKitSyncEnabled as jest.Mock).mockResolvedValue(true);
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(6.5);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('Slept 6.5h last night (via Apple Health). You did Lower Body yesterday.');
    expect(fetchHealthKitSleepHoursForDate).toHaveBeenCalledTimes(1);
    const calledWith = (fetchHealthKitSleepHoursForDate as jest.Mock).mock.calls[0][0] as Date;
    expect(calledWith.getFullYear()).toBe(2026);
    expect(calledWith.getMonth()).toBe(5);
    expect(calledWith.getDate()).toBe(23);
  });

  test('falls back to Oura sleep_hrs when HealthKit sync is disabled', async () => {
    installSupabaseMock({
      recovery: { data: { sleep_hrs: 6.5 }, error: null },
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('Slept 6.5h last night.');
    expect(fetchHealthKitSleepHoursForDate).not.toHaveBeenCalled();
  });

  test('falls back to Oura sleep_hrs when HealthKit sync is enabled but returns no data', async () => {
    installSupabaseMock({
      recovery: { data: { sleep_hrs: 6.5 }, error: null },
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });
    (isHealthKitSyncEnabled as jest.Mock).mockResolvedValue(true);
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('Slept 6.5h last night.');
  });

  test('returns no sleep data when HealthKit sync is enabled but both HealthKit and Oura have nothing', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });
    (isHealthKitSyncEnabled as jest.Mock).mockResolvedValue(true);
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('describes a HealthKit-detected workout from the activity table when no session was logged', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: [], error: null },
      activity: {
        data: { workout_count: 1, workouts: [{ activity: 'pickleball' }] },
        error: null,
      },
    });

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('You did Pickleball yesterday.');
  });

  test('prefers the logged session over the activity table when both exist', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: [{ type: 'run', felt_rating: null }], error: null },
      activity: {
        data: { workout_count: 1, workouts: [{ activity: 'pickleball' }] },
        error: null,
      },
    });

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('You did Run yesterday.');
  });

  test('says there is no data when neither sleep nor activity is available', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('an activity row with workout_count of 0 does not count as activity', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: [], error: null },
      activity: { data: { workout_count: 0, workouts: [] }, error: null },
    });

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('throws if the recovery query returns an error', async () => {
    installSupabaseMock({
      recovery: { data: null, error: { message: 'network down' } },
    });

    await expect(fetchYesterdaySummaryMessage(TODAY)).rejects.toThrow('network down');
  });

  test('throws if the sessions query returns an error', async () => {
    installSupabaseMock({
      recovery: { data: null, error: null },
      sessions: { data: null, error: { message: 'sessions query failed' } },
    });

    await expect(fetchYesterdaySummaryMessage(TODAY)).rejects.toThrow('sessions query failed');
  });
});
