// apps/mobile/lib/sprintLifecycle.test.ts
import {
  fetchPainPoints,
  beginSprint,
  completeDay,
  swapExercise,
  abandonSprint,
  fetchSwapCandidates,
} from './sprintLifecycle';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from './supabase';

beforeEach(() => {
  (supabase.from as jest.Mock).mockClear();
});

function mockChain(overrides: Record<string, any>) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'eq', 'neq', 'in', 'not', 'order', 'maybeSingle', 'single'];
  for (const method of methods) {
    chain[method] = overrides[method] ?? jest.fn(() => chain);
  }
  return chain;
}

describe('fetchPainPoints', () => {
  test('maps snake_case rows to camelCase PainPoint objects, ordered by sort_order', async () => {
    const rows = [
      { id: 'ankle', display_name: 'Ankles', description: 'Ankle stuff' },
      { id: 'nerd_neck', display_name: 'Nerd Neck', description: 'Neck stuff' },
    ];
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({ select: jest.fn(() => mockChain({ order: jest.fn(() => Promise.resolve({ data: rows, error: null })) })) })
    );

    const result = await fetchPainPoints();

    expect(result).toEqual([
      { id: 'ankle', displayName: 'Ankles', description: 'Ankle stuff' },
      { id: 'nerd_neck', displayName: 'Nerd Neck', description: 'Neck stuff' },
    ]);
  });
});

describe('beginSprint', () => {
  test('computes cycle_number as the count of this owner\'s prior sprints for that pain point, plus one', async () => {
    const insertedRow = {
      id: 'sprint-3',
      pain_point_id: 'ankle',
      cycle_number: 3,
      started_on: '2026-09-16',
      status: 'pending_baseline',
    };
    const countChain = mockChain({ eq: jest.fn(() => Promise.resolve({ count: 2, error: null })) });
    const insertChain = mockChain({
      select: jest.fn(() => mockChain({ single: jest.fn(() => Promise.resolve({ data: insertedRow, error: null })) })),
    });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockChain({ select: jest.fn(() => countChain) }))
      .mockReturnValueOnce(mockChain({ insert: jest.fn(() => insertChain) }));

    const result = await beginSprint('ankle');

    expect(result.cycleNumber).toBe(3);
    expect(result.status).toBe('pending_baseline');
  });
});

describe('completeDay', () => {
  test('updates only the day when it is not day 14', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await completeDay('day-1', 7, 'sprint-1');

    expect(supabase.from).toHaveBeenCalledWith('sprint_days');
    expect(supabase.from).not.toHaveBeenCalledWith('sprints');
  });

  test('also flips the sprint to pending_reassessment on day 14', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock).mockImplementation(() => mockChain({ update: updateSpy }));

    await completeDay('day-14', 14, 'sprint-1');

    expect(supabase.from).toHaveBeenCalledWith('sprint_days');
    expect(supabase.from).toHaveBeenCalledWith('sprints');
    expect(updateSpy).toHaveBeenCalledWith({ status: 'pending_reassessment' });
  });
});

describe('swapExercise', () => {
  test('writes the new exercise and records the swap trail', async () => {
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await swapExercise('row-1', 'old-ex', 'new-ex');

    expect(updateSpy).toHaveBeenCalledWith({ exercise_id: 'new-ex', swapped_from_exercise_id: 'old-ex' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'row-1');
  });
});

describe('fetchSwapCandidates', () => {
  test('excludes the currently-assigned exercise and maps names', async () => {
    const rows = [{ exercise_id: 'ex-b', exercises: { name: 'Alt Exercise' } }];
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({
        select: jest.fn(() =>
          mockChain({
            eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ neq: jest.fn(() => Promise.resolve({ data: rows, error: null })) })) })),
          })
        ),
      })
    );

    const result = await fetchSwapCandidates('ankle', 'ankle-balance', 'ex-a');

    expect(result).toEqual([{ exerciseId: 'ex-b', name: 'Alt Exercise' }]);
  });
});

describe('abandonSprint', () => {
  test('sets status to abandoned', async () => {
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await abandonSprint('sprint-1');

    expect(updateSpy).toHaveBeenCalledWith({ status: 'abandoned' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'sprint-1');
  });
});
