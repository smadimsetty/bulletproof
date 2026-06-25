// apps/mobile/lib/homeProgram.test.ts
import { fetchHomeData } from './homeProgram';

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
const YESTERDAY_ISO = '2026-06-23';

const todayRecommendationRow = {
  id: 'rec-today-1',
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's program covers: mobility.",
};

const yesterdayRecommendationRow = {
  id: 'rec-yesterday-1',
  date: YESTERDAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's pick is mobility -- a mobility session was overdue. Runner-up: upper a.",
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

function mockTable(table: string, response: { data: unknown; error: unknown }) {
  return [table, response] as const;
}

function installSupabaseMock(responses: ReadonlyArray<readonly [string, { data: unknown; error: unknown }]>) {
  const byTable = new Map(responses);
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const response = byTable.get(table) ?? { data: null, error: null };
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      order: jest.fn(() => chain),
      maybeSingle: jest.fn(() => Promise.resolve(response)),
      then: (resolve: any) => Promise.resolve(response).then(resolve),
    };
    return chain;
  });
}

describe('fetchHomeData', () => {
  test('returns today\'s program with blocks/exercises and yesterday\'s rationale', async () => {
    installSupabaseMock([
      mockTable('recommendations', { data: todayRecommendationRow, error: null }),
    ]);
    // Two sequential calls to 'recommendations' (today, then yesterday) and
    // one to 'recommendation_blocks' can't share one static mock keyed only
    // by table name, so this test drives the real call sequence explicitly.
    const fromMock = supabase.from as jest.Mock;
    let recommendationsCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        recommendationsCallCount += 1;
        const row = recommendationsCallCount === 1 ? todayRecommendationRow : yesterdayRecommendationRow;
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: row, error: null })),
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
    expect(result.yesterdayRationale).toBe(yesterdayRecommendationRow.public_rationale);
  });

  test('returns nulls when today has no recommendation row yet', async () => {
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
    expect(result.yesterdayRationale).toBeNull();
  });

  test('today recommendation with zero blocks returns an empty blocks array, not an error', async () => {
    const fromMock = supabase.from as jest.Mock;
    let recommendationsCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        recommendationsCallCount += 1;
        const row = recommendationsCallCount === 1 ? todayRecommendationRow : null;
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: row, error: null })),
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
});
