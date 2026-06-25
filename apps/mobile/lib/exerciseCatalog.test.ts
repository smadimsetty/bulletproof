// apps/mobile/lib/exerciseCatalog.test.ts
import { fetchExerciseCatalog, buildSwapFilter, buildAddFilter, type CatalogExercise } from './exerciseCatalog';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

function exercise(overrides: Partial<CatalogExercise>): CatalogExercise {
  return {
    id: 'ex-1',
    name: 'Test Exercise',
    movementPattern: 'push',
    exerciseType: 'strength',
    targetGoals: [],
    bodyParts: [],
    demoVideoUrl: null,
    defaultSets: null,
    defaultRepRange: null,
    unilateral: false,
    isCorrective: false,
    ...overrides,
  };
}

describe('fetchExerciseCatalog', () => {
  test('maps raw snake_case rows into CatalogExercise[]', async () => {
    const rows = [
      {
        id: 'ex-1',
        name: 'Push-up',
        movement_pattern: 'push',
        exercise_type: 'strength',
        target_goals: ['strength_power'],
        body_parts: ['shoulders'],
        demo_video_url: null,
        default_sets: 3,
        default_rep_range: '8-12',
        unilateral: false,
        is_corrective: false,
      },
    ];
    const selectFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    const result = await fetchExerciseCatalog();

    expect(supabase.from).toHaveBeenCalledWith('exercises');
    expect(result).toEqual([
      exercise({
        id: 'ex-1',
        name: 'Push-up',
        movementPattern: 'push',
        exerciseType: 'strength',
        targetGoals: ['strength_power'],
        bodyParts: ['shoulders'],
        defaultSets: 3,
        defaultRepRange: '8-12',
      }),
    ]);
  });

  test('throws if the query returns an error', async () => {
    const selectFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    await expect(fetchExerciseCatalog()).rejects.toThrow('network down');
  });
});

describe('buildSwapFilter', () => {
  test('matches same movement_pattern with an intersecting body_part or target_goal, excludes the target itself', () => {
    const target = exercise({ id: 'ex-1', movementPattern: 'push', bodyParts: ['shoulders'], targetGoals: ['strength_power'] });
    const samePatternIntersecting = exercise({ id: 'ex-2', movementPattern: 'push', bodyParts: ['shoulders'] });
    const samePatternNoOverlap = exercise({ id: 'ex-3', movementPattern: 'push', bodyParts: ['hips'], targetGoals: ['endurance'] });
    const differentPattern = exercise({ id: 'ex-4', movementPattern: 'pull', bodyParts: ['shoulders'] });
    const theTargetItself = target;

    const filter = buildSwapFilter(target);

    expect(filter(samePatternIntersecting)).toBe(true);
    expect(filter(samePatternNoOverlap)).toBe(false);
    expect(filter(differentPattern)).toBe(false);
    expect(filter(theTargetItself)).toBe(false);
  });
});

describe('buildAddFilter', () => {
  test('matches any candidate whose movement_pattern is in the block\'s set', () => {
    const filter = buildAddFilter(['push', 'pull']);

    expect(filter(exercise({ movementPattern: 'push' }))).toBe(true);
    expect(filter(exercise({ movementPattern: 'pull' }))).toBe(true);
    expect(filter(exercise({ movementPattern: 'squat' }))).toBe(false);
  });

  test('matches everything when the block has no movement patterns (e.g. an ad-hoc/empty block)', () => {
    const filter = buildAddFilter([]);

    expect(filter(exercise({ movementPattern: 'squat' }))).toBe(true);
    expect(filter(exercise({ movementPattern: 'mobility' }))).toBe(true);
  });
});
