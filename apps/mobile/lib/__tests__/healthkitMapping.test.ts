// apps/mobile/lib/__tests__/healthkitMapping.test.ts
import {
  groupWorkoutsByLocalDate,
  localDateString,
  mergeDailyMetricsIntoActivityRows,
  sumQuantityByLocalDate,
  sumSleepMinutesByLocalDate,
  toActivityRows,
  type MinimalQuantitySample,
  type MinimalSleepSample,
  type MinimalWorkoutSample,
} from '../healthkitMapping';

function sample(overrides: Partial<MinimalWorkoutSample>): MinimalWorkoutSample {
  return {
    uuid: 'test-uuid',
    startDate: new Date('2026-06-20T22:00:00.000Z'),
    endDate: new Date('2026-06-20T23:30:00.000Z'),
    workoutActivityTypeName: 'pickleball',
    totalEnergyBurnedKcal: 450,
    totalDistanceMeters: null,
    ...overrides,
  };
}

describe('localDateString', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(localDateString(new Date(2026, 5, 20, 14, 30))).toBe('2026-06-20');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateString(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('groupWorkoutsByLocalDate', () => {
  it('groups multiple samples on the same local date together', () => {
    const morning = sample({
      startDate: new Date(2026, 5, 20, 7, 0),
      endDate: new Date(2026, 5, 20, 7, 30),
      workoutActivityTypeName: 'running',
    });
    const evening = sample({
      startDate: new Date(2026, 5, 20, 18, 0),
      endDate: new Date(2026, 5, 20, 19, 30),
      workoutActivityTypeName: 'pickleball',
    });

    const grouped = groupWorkoutsByLocalDate([morning, evening]);

    expect(grouped.size).toBe(1);
    expect(grouped.get('2026-06-20')).toHaveLength(2);
  });

  it('keeps separate dates in separate groups', () => {
    const day1 = sample({ startDate: new Date(2026, 5, 20, 7, 0) });
    const day2 = sample({ startDate: new Date(2026, 5, 21, 7, 0) });

    const grouped = groupWorkoutsByLocalDate([day1, day2]);

    expect(grouped.size).toBe(2);
    expect(grouped.has('2026-06-20')).toBe(true);
    expect(grouped.has('2026-06-21')).toBe(true);
  });

  it('returns an empty map for no samples', () => {
    expect(groupWorkoutsByLocalDate([]).size).toBe(0);
  });
});

describe('toActivityRows', () => {
  it('maps a single day with one workout to one activity row', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({
        startDate: new Date(2026, 5, 20, 18, 0),
        endDate: new Date(2026, 5, 20, 19, 30),
        workoutActivityTypeName: 'pickleball',
        totalEnergyBurnedKcal: 520,
        totalDistanceMeters: null,
      }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-06-20');
    expect(rows[0].workout_count).toBe(1);
    expect(rows[0].activity_score).toBeNull();
    expect(rows[0].workouts).toEqual([
      {
        activity: 'pickleball',
        intensity: null,
        calories: 520,
        distance: null,
        start_datetime: new Date(2026, 5, 20, 18, 0).toISOString(),
        end_datetime: new Date(2026, 5, 20, 19, 30).toISOString(),
        source: 'healthkit',
      },
    ]);
  });

  it('sets workout_count to the number of samples on that day', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({ startDate: new Date(2026, 5, 20, 7, 0), workoutActivityTypeName: 'running' }),
      sample({ startDate: new Date(2026, 5, 20, 18, 0), workoutActivityTypeName: 'pickleball' }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows).toHaveLength(1);
    expect(rows[0].workout_count).toBe(2);
    expect(rows[0].workouts.map((w) => w.activity)).toEqual(['running', 'pickleball']);
  });

  it('passes through a null totalDistance as null distance', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({ totalDistanceMeters: null }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows[0].workouts[0].distance).toBeNull();
  });

  it('returns an empty array for an empty grouping', () => {
    expect(toActivityRows(new Map())).toEqual([]);
  });
});

function quantitySample(overrides: Partial<MinimalQuantitySample>): MinimalQuantitySample {
  return {
    startDate: new Date(2026, 5, 20, 8, 0),
    endDate: new Date(2026, 5, 20, 8, 0),
    quantity: 100,
    ...overrides,
  };
}

function sleepSample(overrides: Partial<MinimalSleepSample>): MinimalSleepSample {
  return {
    startDate: new Date(2026, 5, 19, 23, 0),
    endDate: new Date(2026, 5, 20, 6, 0),
    categoryValue: 'asleepCore',
    ...overrides,
  };
}

describe('sumQuantityByLocalDate', () => {
  it('sums multiple samples on the same local date', () => {
    const samples = [
      quantitySample({ startDate: new Date(2026, 5, 20, 8, 0), quantity: 300 }),
      quantitySample({ startDate: new Date(2026, 5, 20, 18, 0), quantity: 200 }),
    ];

    const result = sumQuantityByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(500);
  });

  it('keeps separate dates in separate buckets', () => {
    const samples = [
      quantitySample({ startDate: new Date(2026, 5, 20, 8, 0), quantity: 300 }),
      quantitySample({ startDate: new Date(2026, 5, 21, 8, 0), quantity: 150 }),
    ];

    const result = sumQuantityByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(300);
    expect(result.get('2026-06-21')).toBe(150);
  });

  it('returns an empty map for no samples', () => {
    expect(sumQuantityByLocalDate([]).size).toBe(0);
  });
});

describe('sumSleepMinutesByLocalDate', () => {
  it('sums asleep-bucket durations and excludes inBed/awake', () => {
    const samples = [
      sleepSample({
        startDate: new Date(2026, 5, 19, 23, 0),
        endDate: new Date(2026, 5, 20, 1, 0),
        categoryValue: 'asleepCore',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 0),
        endDate: new Date(2026, 5, 20, 1, 15),
        categoryValue: 'awake',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 15),
        endDate: new Date(2026, 5, 20, 6, 15),
        categoryValue: 'asleepDeep',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 19, 22, 30),
        endDate: new Date(2026, 5, 19, 23, 0),
        categoryValue: 'inBed',
      }),
    ];

    const result = sumSleepMinutesByLocalDate(samples);

    // bucketed by the sample's *start* local date: 120 + 300 = 420 minutes
    // on 2026-06-19 (23:00-01:00 starts on the 19th) + (01:15-06:15 starts
    // on the 20th) -- see Step 3's implementation for the exact bucketing
    // rule (by startDate's local date, matching groupWorkoutsByLocalDate).
    expect(result.get('2026-06-19')).toBe(120);
    expect(result.get('2026-06-20')).toBe(300);
  });

  it('treats asleepUnspecified and asleep as asleep-bucket', () => {
    const samples = [
      sleepSample({
        startDate: new Date(2026, 5, 20, 1, 0),
        endDate: new Date(2026, 5, 20, 2, 0),
        categoryValue: 'asleep',
      }),
      sleepSample({
        startDate: new Date(2026, 5, 20, 2, 0),
        endDate: new Date(2026, 5, 20, 2, 30),
        categoryValue: 'asleepUnspecified',
      }),
    ];

    const result = sumSleepMinutesByLocalDate(samples);

    expect(result.get('2026-06-20')).toBe(90);
  });

  it('returns an empty map for no samples', () => {
    expect(sumSleepMinutesByLocalDate([]).size).toBe(0);
  });
});

describe('mergeDailyMetricsIntoActivityRows', () => {
  it('produces one partial row per date present in either map', () => {
    const calories = new Map([['2026-06-20', 2200]]);
    const steps = new Map([
      ['2026-06-20', 8000],
      ['2026-06-21', 5000],
    ]);

    const rows = mergeDailyMetricsIntoActivityRows(calories, steps);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.date === '2026-06-20')).toEqual({
      date: '2026-06-20',
      total_calories: 2200,
      steps: 8000,
    });
    expect(rows.find((r) => r.date === '2026-06-21')).toEqual({
      date: '2026-06-21',
      total_calories: null,
      steps: 5000,
    });
  });

  it('returns an empty array when both maps are empty', () => {
    expect(mergeDailyMetricsIntoActivityRows(new Map(), new Map())).toEqual([]);
  });
});
