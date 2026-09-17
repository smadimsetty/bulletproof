// apps/mobile/lib/sprintLifecycle.test.ts
import {
  fetchPainPoints,
  beginSprint,
  completeDay,
  swapExercise,
  abandonSprint,
  fetchSwapCandidates,
  fetchInFlightSprint,
  isSprintPastFinalDay,
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
  test('carries the new exercise\'s own prescription across, and records the swap trail', async () => {
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await swapExercise('row-1', 'old-ex', 'new-ex', 1, '20 m');

    expect(updateSpy).toHaveBeenCalledWith({
      exercise_id: 'new-ex',
      swapped_from_exercise_id: 'old-ex',
      prescribed_sets: 1,
      prescribed_reps_or_duration: '20 m',
    });
    expect(eqSpy).toHaveBeenCalledWith('id', 'row-1');
  });

  test('writes nulls rather than leaving a stale prescription when the new exercise has none', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await swapExercise('row-1', 'old-ex', 'new-ex', null, null);

    expect(updateSpy).toHaveBeenCalledWith({
      exercise_id: 'new-ex',
      swapped_from_exercise_id: 'old-ex',
      prescribed_sets: null,
      prescribed_reps_or_duration: null,
    });
  });
});

describe('fetchSwapCandidates', () => {
  test('excludes the currently-assigned exercise and maps names plus each candidate\'s prescription', async () => {
    const rows = [
      { exercise_id: 'ex-b', prescribed_sets: 2, prescribed_reps_or_duration: '15 reps', exercises: { name: 'Alt Exercise' } },
      { exercise_id: 'ex-c', prescribed_sets: null, prescribed_reps_or_duration: null, exercises: { name: 'Other Alt' } },
    ];
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

    expect(result).toEqual([
      { exerciseId: 'ex-b', name: 'Alt Exercise', prescribedSets: 2, prescribedRepsOrDuration: '15 reps' },
      { exerciseId: 'ex-c', name: 'Other Alt', prescribedSets: null, prescribedRepsOrDuration: null },
    ]);
  });
});

describe('isSprintPastFinalDay', () => {
  test('false on day 1 and on day 14 itself', () => {
    expect(isSprintPastFinalDay('2026-09-01', new Date('2026-09-01T09:00:00'))).toBe(false);
    expect(isSprintPastFinalDay('2026-09-01', new Date('2026-09-14T23:00:00'))).toBe(false);
  });

  test('true from day 15 onward', () => {
    expect(isSprintPastFinalDay('2026-09-01', new Date('2026-09-15T00:30:00'))).toBe(true);
    expect(isSprintPastFinalDay('2026-09-01', new Date('2026-10-20T12:00:00'))).toBe(true);
  });
});

describe('fetchInFlightSprint', () => {
  function mockSprintRow(overrides: Record<string, any> = {}) {
    return {
      id: 'sprint-1',
      pain_point_id: 'ankle',
      cycle_number: 1,
      started_on: '2026-09-01',
      status: 'active',
      ...overrides,
    };
  }

  function mockFetch(row: any) {
    return mockChain({
      select: jest.fn(() =>
        mockChain({ in: jest.fn(() => mockChain({ maybeSingle: jest.fn(() => Promise.resolve({ data: row, error: null })) })) })
      ),
    });
  }

  test('returns null when there is no in-flight sprint', async () => {
    (supabase.from as jest.Mock).mockReturnValue(mockFetch(null));
    expect(await fetchInFlightSprint()).toBeNull();
  });

  test('leaves an active sprint alone while it is still inside its 14 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T08:00:00'));
    (supabase.from as jest.Mock).mockReturnValue(mockFetch(mockSprintRow()));

    const result = await fetchInFlightSprint();

    expect(result?.status).toBe('active');
    expect(supabase.from).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('flips an active sprint to pending_reassessment once the calendar is past day 14, even if day 14 was never completed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T08:00:00'));
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockFetch(mockSprintRow()))
      .mockReturnValueOnce(mockChain({ update: updateSpy }));

    const result = await fetchInFlightSprint();

    expect(updateSpy).toHaveBeenCalledWith({ status: 'pending_reassessment' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'sprint-1');
    expect(result?.status).toBe('pending_reassessment');
    jest.useRealTimers();
  });

  test('does not touch a sprint that is not active, however old it is', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-01T08:00:00'));
    (supabase.from as jest.Mock).mockReturnValue(mockFetch(mockSprintRow({ status: 'pending_baseline' })));

    const result = await fetchInFlightSprint();

    expect(result?.status).toBe('pending_baseline');
    expect(supabase.from).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
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
