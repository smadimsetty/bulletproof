// apps/mobile/lib/loggerBlock.test.ts
import { fetchLoggerBlock } from './loggerBlock';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const blockRow = {
  id: 'block-1',
  block_order: 0,
  block_type: 'mobility',
  split_day_label: null,
  title: 'Mobility',
  estimated_minutes: 35,
  recommendation_block_exercises: [
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
        movement_pattern: 'mobility',
        exercise_type: 'mobility_stretch',
        demo_video_url: 'https://www.youtube.com/watch?v=Hm_Iu72bJJg',
      },
    },
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
        movement_pattern: 'mobility',
        exercise_type: 'mobility_stretch',
        demo_video_url: null,
      },
    },
  ],
};

function mockSingle(response: { data: unknown; error: unknown }) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve(response)),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe('fetchLoggerBlock', () => {
  test('returns the block with exercises sorted by exercise_order', async () => {
    mockSingle({ data: blockRow, error: null });

    const result = await fetchLoggerBlock('block-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('block-1');
    expect(result!.blockType).toBe('mobility');
    expect(result!.exercises.map((e) => e.id)).toEqual(['bex-1', 'bex-2']);
    expect(result!.exercises[0].exerciseType).toBe('mobility_stretch');
    expect(result!.exercises[1].demoVideoUrl).toBe('https://www.youtube.com/watch?v=Hm_Iu72bJJg');
  });

  test('returns null when no block matches the id', async () => {
    mockSingle({ data: null, error: null });

    const result = await fetchLoggerBlock('missing-id');

    expect(result).toBeNull();
  });

  test('throws if the query returns an error', async () => {
    mockSingle({ data: null, error: { message: 'network down' } });

    await expect(fetchLoggerBlock('block-1')).rejects.toThrow('network down');
  });
});
