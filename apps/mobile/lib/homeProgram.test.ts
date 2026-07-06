// apps/mobile/lib/homeProgram.test.ts
import { fetchHomeData, shouldAttemptFreshRecommendation, type HomeData } from './homeProgram';

// supabase-js's query builder is chainable; this mock provides a minimal
// per-table chain matching exactly the calls fetchHomeData makes, mirroring
// recommendations.test.ts's existing mocking convention.
jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const TODAY = new Date(2026, 5, 24, 12, 0, 0); // 2026-06-24 local noon
const TODAY_ISO = '2026-06-24';

const todayRecommendationRow = {
  id: 'rec-today-1',
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's program covers: mobility.",
  score_breakdown: { readiness: 7 },
};

const blocksWithExercisesRow = [
  {
    id: 'block-1',
    block_order: 0,
    block_type: 'mobility',
    split_day_label: null,
    title: 'Mobility',
    estimated_minutes: null,
    recommendation_block_exercises: [
      {
        id: 'bex-1',
        exercise_order: 0,
        prescribed_sets: 3,
        prescribed_reps: '10 reps/side',
        prescribed_weight_note: null,
        is_unilateral_left_first: true,
        notes: null,
        exercises: {
          id: 'ex-1',
          name: 'Weighted Ankle Dorsiflexion Mobilization',
          demo_video_url: null,
          exercise_type: 'mobility_stretch',
        },
      },
      {
        id: 'bex-2',
        exercise_order: 1,
        prescribed_sets: 3,
        prescribed_reps: '8-10 reps/side',
        prescribed_weight_note: null,
        is_unilateral_left_first: true,
        notes: null,
        exercises: {
          id: 'ex-2',
          name: 'Half-Kneeling Ankle Mobilization',
          demo_video_url: 'https://www.youtube.com/watch?v=Hm_Iu72bJJg',
          exercise_type: 'mobility_stretch',
        },
      },
    ],
  },
];

describe('fetchHomeData', () => {
  test('returns today\'s program with blocks/exercises', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: todayRecommendationRow, error: null })),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: blocksWithExercisesRow, error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).not.toBeNull();
    expect(result.today!.recommendationId).toBe('rec-today-1');
    expect(result.today!.topPick).toBe('mobility');
    expect(result.today!.blocks).toHaveLength(1);
    expect(result.today!.blocks[0].title).toBe('Mobility');
    expect(result.today!.blocks[0].exercises).toHaveLength(2);
    expect(result.today!.blocks[0].exercises[0].name).toBe('Weighted Ankle Dorsiflexion Mobilization');
    expect(result.today!.blocks[0].exercises[0].demoVideoUrl).toBeNull();
    expect(result.today!.blocks[0].exercises[1].demoVideoUrl).toBe(
      'https://www.youtube.com/watch?v=Hm_Iu72bJJg'
    );
  });

  test('returns a null today when there is no recommendation row yet', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).toBeNull();
  });

  test('today recommendation with zero blocks returns an empty blocks array, not an error', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: todayRecommendationRow, error: null })),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).not.toBeNull();
    expect(result.today!.blocks).toEqual([]);
  });

  test('throws if the recommendation query returns an error', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: { message: 'network down' } })),
      };
      return chain;
    });

    await expect(fetchHomeData(TODAY)).rejects.toThrow('network down');
  });

  test('marks today as provisional when score_breakdown.readiness is null', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() =>
            Promise.resolve({
              data: { ...todayRecommendationRow, score_breakdown: { readiness: null } },
              error: null,
            })
          ),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today!.isProvisional).toBe(true);
  });

  test('marks today as not provisional when score_breakdown.readiness is present', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: todayRecommendationRow, error: null })),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today!.isProvisional).toBe(false);
  });
});

describe('shouldAttemptFreshRecommendation', () => {
  const provisionalToday: HomeData = {
    today: { ...todayFixtureAsProvisional() },
  };
  const freshToday: HomeData = {
    today: { ...todayFixtureAsProvisional(), isProvisional: false },
  };
  const noToday: HomeData = { today: null };

  function todayFixtureAsProvisional() {
    return {
      recommendationId: 'rec-1',
      date: '2026-07-05',
      topPick: 'rest' as const,
      runnerUp: 'mobility' as const,
      publicRationale: 'Recommended blocks: rest.',
      isProvisional: true,
      blocks: [],
    };
  }

  test('attempts when there is no row yet and nothing was attempted today', () => {
    expect(shouldAttemptFreshRecommendation(noToday, '2026-07-05', null)).toBe(true);
  });

  test('attempts when provisional and nothing was attempted today', () => {
    expect(shouldAttemptFreshRecommendation(provisionalToday, '2026-07-05', null)).toBe(true);
  });

  test('does not re-attempt provisional data already attempted today', () => {
    expect(shouldAttemptFreshRecommendation(provisionalToday, '2026-07-05', '2026-07-05')).toBe(false);
  });

  test('does not re-attempt a missing row already attempted today', () => {
    expect(shouldAttemptFreshRecommendation(noToday, '2026-07-05', '2026-07-05')).toBe(false);
  });

  test('attempts again once the calendar day has moved on', () => {
    expect(shouldAttemptFreshRecommendation(provisionalToday, '2026-07-06', '2026-07-05')).toBe(true);
  });

  test('never attempts once today is no longer provisional', () => {
    expect(shouldAttemptFreshRecommendation(freshToday, '2026-07-05', null)).toBe(false);
  });
});
