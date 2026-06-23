// apps/mobile/lib/__tests__/healthkitMapping.test.ts
import {
  groupWorkoutsByLocalDate,
  localDateString,
  toActivityRows,
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
