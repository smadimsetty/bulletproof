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
    expect(buildYesterdayInsightLine({ hours: null }, noActivity)).toBeNull();
  });

  test('good sleep + no activity -> push-hard insight', () => {
    const sleep: YesterdaySleep = { hours: 7.5 };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBe(
      'Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('good sleep + had activity -> no push-hard insight (already an active day)', () => {
    const sleep: YesterdaySleep = { hours: 7.5 };
    expect(buildYesterdayInsightLine(sleep, hadActivity)).toBeNull();
  });

  test('low sleep -> ease-up insight regardless of activity', () => {
    const sleep: YesterdaySleep = { hours: 5.5 };
    expect(buildYesterdayInsightLine(sleep, hadActivity)).toBe(
      'Short on sleep last night — consider easing up today.'
    );
  });

  test('sleep exactly at the low threshold does not trigger the ease-up insight', () => {
    const sleep: YesterdaySleep = { hours: 6 };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBeNull();
  });

  test('sleep exactly at the good threshold with no activity triggers push-hard', () => {
    const sleep: YesterdaySleep = { hours: 7 };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBe(
      'Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('mid-range sleep with no activity -> no insight either way', () => {
    const sleep: YesterdaySleep = { hours: 6.5 };
    expect(buildYesterdayInsightLine(sleep, noActivity)).toBeNull();
  });
});

describe('buildYesterdaySummaryMessage', () => {
  const noSleep: YesterdaySleep = { hours: null };
  const noActivity: YesterdayActivity = { description: null };

  test('sleep only, mid-range hours -> describes sleep with no insight', () => {
    const sleep: YesterdaySleep = { hours: 6.5 };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 6.5h last night (via Apple Health).'
    );
  });

  test('activity only -> describes activity', () => {
    const activity: YesterdayActivity = { description: 'Pickleball' };
    expect(buildYesterdaySummaryMessage(noSleep, activity)).toBe('You did Pickleball yesterday.');
  });

  test('both sleep and activity, mid-range hours -> combines both into one message', () => {
    const sleep: YesterdaySleep = { hours: 6.5 };
    const activity: YesterdayActivity = { description: 'Lower Body' };
    expect(buildYesterdaySummaryMessage(sleep, activity)).toBe(
      'Slept 6.5h last night (via Apple Health). You did Lower Body yesterday.'
    );
  });

  test('neither -> honest no-data message', () => {
    expect(buildYesterdaySummaryMessage(noSleep, noActivity)).toBe('No data from yesterday.');
  });

  test('good sleep + no activity -> sleep sentence plus push-hard insight', () => {
    const sleep: YesterdaySleep = { hours: 7.2 };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 7.2h last night (via Apple Health). Well rested with a light day yesterday — good day to push hard.'
    );
  });

  test('sleep hours of exactly 0 still counts as real sleep data and triggers the ease-up insight', () => {
    const sleep: YesterdaySleep = { hours: 0 };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 0.0h last night (via Apple Health). Short on sleep last night — consider easing up today.'
    );
  });

  test('rounds sleep hours to one decimal place', () => {
    const sleep: YesterdaySleep = { hours: 6.166666 };
    expect(buildYesterdaySummaryMessage(sleep, noActivity)).toBe(
      'Slept 6.2h last night (via Apple Health).'
    );
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
  sessions?: { data: unknown; error: unknown };
  activity?: { data: unknown; error: unknown };
}) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
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
    (isHealthKitSyncEnabled as jest.Mock).mockReset().mockResolvedValue(true);
  });

  test('queries HealthKit for last night using TODAY (not yesterday), since the window is "night ending on this date"', async () => {
    installSupabaseMock({
      sessions: { data: [{ type: 'lower', felt_rating: 4 }], error: null },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(6.5);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('Slept 6.5h last night (via Apple Health). You did Lower Body yesterday.');
    expect(fetchHealthKitSleepHoursForDate).toHaveBeenCalledTimes(1);
    const calledWith = (fetchHealthKitSleepHoursForDate as jest.Mock).mock.calls[0][0] as Date;
    expect(calledWith.getFullYear()).toBe(2026);
    expect(calledWith.getMonth()).toBe(5);
    expect(calledWith.getDate()).toBe(24); // TODAY's date, not YESTERDAY's
  });

  test('returns no sleep data (and never queries HealthKit) when healthkit_sync_enabled is off', async () => {
    installSupabaseMock({
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });
    (isHealthKitSyncEnabled as jest.Mock).mockResolvedValue(false);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
    expect(fetchHealthKitSleepHoursForDate).not.toHaveBeenCalled();
  });

  test('returns no sleep data when HealthKit sync is enabled but has nothing for that night', async () => {
    installSupabaseMock({
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('describes a HealthKit-detected workout from the activity table when no session was logged', async () => {
    installSupabaseMock({
      sessions: { data: [], error: null },
      activity: {
        data: { workout_count: 1, workouts: [{ activity: 'pickleball' }] },
        error: null,
      },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('You did Pickleball yesterday.');
  });

  test('prefers the logged session over the activity table when both exist', async () => {
    installSupabaseMock({
      sessions: { data: [{ type: 'run', felt_rating: null }], error: null },
      activity: {
        data: { workout_count: 1, workouts: [{ activity: 'pickleball' }] },
        error: null,
      },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('You did Run yesterday.');
  });

  test('says there is no data when neither sleep nor activity is available', async () => {
    installSupabaseMock({
      sessions: { data: [], error: null },
      activity: { data: null, error: null },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('an activity row with workout_count of 0 does not count as activity', async () => {
    installSupabaseMock({
      sessions: { data: [], error: null },
      activity: { data: { workout_count: 0, workouts: [] }, error: null },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    const message = await fetchYesterdaySummaryMessage(TODAY);

    expect(message).toBe('No data from yesterday.');
  });

  test('throws if the sessions query returns an error', async () => {
    installSupabaseMock({
      sessions: { data: null, error: { message: 'sessions query failed' } },
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    await expect(fetchYesterdaySummaryMessage(TODAY)).rejects.toThrow('sessions query failed');
  });

  test('activity is still attributed to the calendar day before today (yesterday), unlike sleep', async () => {
    const sessionsEq = jest.fn(() => Promise.resolve({ data: [{ type: 'mobility', felt_rating: 3 }], error: null }));
    const activityEq = jest.fn(() => activityChain);
    const activityChain: any = { select: jest.fn(() => activityChain), eq: activityEq, maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })) };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'sessions') {
        const chain: any = { select: jest.fn(() => chain), eq: sessionsEq };
        return chain;
      }
      if (table === 'activity') {
        return activityChain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });
    (fetchHealthKitSleepHoursForDate as jest.Mock).mockResolvedValue(null);

    await fetchYesterdaySummaryMessage(TODAY);

    expect(sessionsEq).toHaveBeenCalledWith('date', YESTERDAY_ISO);
    expect(activityEq).toHaveBeenCalledWith('date', YESTERDAY_ISO);
  });
});
