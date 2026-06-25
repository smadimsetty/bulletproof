import {
  estimateOneRepMax,
  aggregateWeeklyVolumeByBodyPart,
  totalVolumeByBodyPart,
  rankBestLifts,
  fetchMuscleGroupLogs,
  type MuscleGroupLogRow,
} from './muscleGroupVolume';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from './supabase';

function row(overrides: Partial<MuscleGroupLogRow>): MuscleGroupLogRow {
  return {
    date: '2026-06-22',
    exerciseId: 'ex-1',
    exerciseName: 'Barbell Back Squat',
    bodyParts: ['hips', 'knees'],
    isComplex: true,
    repsCompleted: 5,
    weightKg: 100,
    ...overrides,
  };
}

describe('estimateOneRepMax', () => {
  test('uses the Epley formula for a complex lift with reps and weight', () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(estimateOneRepMax(row({ isComplex: true, weightKg: 100, repsCompleted: 5 }))).toBeCloseTo(116.67, 1);
  });

  test('uses raw weight for a non-complex lift, ignoring reps', () => {
    expect(estimateOneRepMax(row({ isComplex: false, weightKg: 20, repsCompleted: 12 }))).toBe(20);
  });

  test('uses raw weight for a complex lift with no reps logged', () => {
    expect(estimateOneRepMax(row({ isComplex: true, weightKg: 80, repsCompleted: null }))).toBe(80);
  });

  test('returns null for a bodyweight set (no weight to compare)', () => {
    expect(estimateOneRepMax(row({ weightKg: null, repsCompleted: 10 }))).toBeNull();
  });
});

describe('aggregateWeeklyVolumeByBodyPart', () => {
  test('sums reps * weight into the correct ISO week and every targeted body part', () => {
    const result = aggregateWeeklyVolumeByBodyPart([
      row({ date: '2026-06-22', bodyParts: ['hips', 'knees'], repsCompleted: 5, weightKg: 100 }), // 500
      row({ date: '2026-06-24', bodyParts: ['hips'], repsCompleted: 8, weightKg: 50 }), // 400, same ISO week (Mon 06-22)
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        { weekStart: '2026-06-22', bodyPart: 'hips', volume: 900 },
        { weekStart: '2026-06-22', bodyPart: 'knees', volume: 500 },
      ])
    );
  });

  test('bodyweight sets contribute reps alone, not reps * 0', () => {
    const result = aggregateWeeklyVolumeByBodyPart([
      row({ date: '2026-06-22', bodyParts: ['core'], repsCompleted: 15, weightKg: null }),
    ]);
    expect(result).toEqual([{ weekStart: '2026-06-22', bodyPart: 'core', volume: 15 }]);
  });

  test('rows with no reps logged at all contribute zero, not NaN', () => {
    const result = aggregateWeeklyVolumeByBodyPart([
      row({ date: '2026-06-22', bodyParts: ['neck'], repsCompleted: null, weightKg: null }),
    ]);
    expect(result).toEqual([{ weekStart: '2026-06-22', bodyPart: 'neck', volume: 0 }]);
  });

  test('separate ISO weeks produce separate buckets', () => {
    const result = aggregateWeeklyVolumeByBodyPart([
      row({ date: '2026-06-22', bodyParts: ['hips'], repsCompleted: 5, weightKg: 100 }),
      row({ date: '2026-06-29', bodyParts: ['hips'], repsCompleted: 5, weightKg: 100 }),
    ]);
    expect(result).toEqual(
      expect.arrayContaining([
        { weekStart: '2026-06-22', bodyPart: 'hips', volume: 500 },
        { weekStart: '2026-06-29', bodyPart: 'hips', volume: 500 },
      ])
    );
  });
});

describe('totalVolumeByBodyPart', () => {
  test('sums weekly buckets into one total per body part, sorted descending', () => {
    const result = totalVolumeByBodyPart([
      { weekStart: '2026-06-01', bodyPart: 'hips', volume: 500 },
      { weekStart: '2026-06-08', bodyPart: 'hips', volume: 300 },
      { weekStart: '2026-06-01', bodyPart: 'chest', volume: 1200 },
    ]);

    expect(result).toEqual([
      { bodyPart: 'chest', volume: 1200 },
      { bodyPart: 'hips', volume: 800 },
    ]);
  });

  test('returns an empty array for no input', () => {
    expect(totalVolumeByBodyPart([])).toEqual([]);
  });
});

describe('rankBestLifts', () => {
  test('filters to the requested body part, sorted descending by estimated 1RM', () => {
    const rows = [
      row({ exerciseName: 'Squat', bodyParts: ['hips'], weightKg: 100, repsCompleted: 5, isComplex: true }),
      row({ exerciseName: 'Hip Thrust', bodyParts: ['hips'], weightKg: 140, repsCompleted: 3, isComplex: true }),
      row({ exerciseName: 'Bicep Curl', bodyParts: ['biceps'], weightKg: 200, repsCompleted: 1, isComplex: true }),
    ];

    const result = rankBestLifts(rows, 'hips');

    expect(result.map((r) => r.exerciseName)).toEqual(['Hip Thrust', 'Squat']);
    expect(result[0].estimatedOneRepMax).toBeGreaterThan(result[1].estimatedOneRepMax);
  });

  test('excludes rows with no comparable weight', () => {
    const rows = [row({ bodyParts: ['core'], weightKg: null, repsCompleted: 20 })];
    expect(rankBestLifts(rows, 'core')).toEqual([]);
  });
});

describe('fetchMuscleGroupLogs', () => {
  test('queries completed exercise_logs joined to exercises within the date range', async () => {
    const lteFn = jest.fn().mockResolvedValue({
      data: [
        {
          date: '2026-06-22',
          exercise_id: 'ex-1',
          reps_completed: 5,
          weight_kg: 100,
          exercises: { name: 'Barbell Back Squat', body_parts: ['hips', 'knees'], is_complex: true },
        },
      ],
      error: null,
    });
    const gteFn = jest.fn(() => ({ lte: lteFn }));
    const eqFn = jest.fn(() => ({ gte: gteFn }));
    const selectFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    const result = await fetchMuscleGroupLogs({ startDate: '2026-06-22', endDate: '2026-06-28' });

    expect(supabase.from).toHaveBeenCalledWith('exercise_logs');
    expect(eqFn).toHaveBeenCalledWith('completed', true);
    expect(gteFn).toHaveBeenCalledWith('date', '2026-06-22');
    expect(lteFn).toHaveBeenCalledWith('date', '2026-06-28');
    expect(result).toEqual([
      {
        date: '2026-06-22',
        exerciseId: 'ex-1',
        exerciseName: 'Barbell Back Squat',
        bodyParts: ['hips', 'knees'],
        isComplex: true,
        repsCompleted: 5,
        weightKg: 100,
      },
    ]);
  });

  test('throws if the query returns an error', async () => {
    const lteFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'down' } });
    const gteFn = jest.fn(() => ({ lte: lteFn }));
    const eqFn = jest.fn(() => ({ gte: gteFn }));
    const selectFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    await expect(fetchMuscleGroupLogs({ startDate: '2026-06-22', endDate: '2026-06-28' })).rejects.toThrow('down');
  });
});
