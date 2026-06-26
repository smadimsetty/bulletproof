// apps/mobile/lib/exerciseLogs.test.ts
import { deleteExerciseLog, fetchTodaysExerciseLogs, upsertExerciseLog } from './exerciseLogs';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const TODAY = new Date(2026, 5, 24, 18, 0, 0); // 2026-06-24 local evening
const TODAY_ISO = '2026-06-24';

describe('fetchTodaysExerciseLogs', () => {
  test('queries exercise_logs filtered to today and the given block-exercise ids', async () => {
    const rows = [
      {
        id: 'log-1',
        recommendation_block_exercise_id: 'bex-1',
        exercise_id: 'ex-1',
        block_type: 'mobility',
        completed: true,
        set_number: null,
        reps_completed: null,
        weight_kg: null,
        logged_at: '2026-06-24T18:00:00Z',
        notes: null,
      },
    ];
    const inFn = jest.fn().mockResolvedValue({ data: rows, error: null });
    const eqFn = jest.fn(() => ({ in: inFn }));
    const selectFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    const result = await fetchTodaysExerciseLogs(['bex-1']);

    expect(supabase.from).toHaveBeenCalledWith('exercise_logs');
    expect(eqFn).toHaveBeenCalledWith('date', TODAY_ISO_TODAY());
    expect(inFn).toHaveBeenCalledWith('recommendation_block_exercise_id', ['bex-1']);
    expect(result).toHaveLength(1);
    expect(result[0].completed).toBe(true);
  });

  function TODAY_ISO_TODAY() {
    // fetchTodaysExerciseLogs always uses "today" as of call time -- this
    // helper keeps the assertion honest against the real local date the
    // test machine resolves "now" to, rather than hardcoding a date that
    // would only match on one specific calendar day.
    return require('./healthkitMapping').localDateString(new Date());
  }

  test('returns an empty array when blockExerciseIds is empty, without querying', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockClear();

    const result = await fetchTodaysExerciseLogs([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  test('throws if the query returns an error', async () => {
    const inFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const eqFn = jest.fn(() => ({ in: inFn }));
    const selectFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });

    await expect(fetchTodaysExerciseLogs(['bex-1'])).rejects.toThrow('network down');
  });
});

describe('upsertExerciseLog', () => {
  function mockExistingLookup(existing: { id: string } | null) {
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: existing, error: null });
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      is: jest.fn(() => chain),
      maybeSingle: maybeSingleFn,
    };
    return chain;
  }

  test('inserts a new row when no matching log exists yet (prescribed strength set)', async () => {
    const selectChain = mockExistingLookup(null);
    const insertFn = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation(() => ({
      ...selectChain,
      insert: insertFn,
    }));

    await upsertExerciseLog({
      date: TODAY,
      recommendationBlockExerciseId: 'bex-1',
      exerciseId: 'ex-1',
      blockType: 'lower',
      setNumber: 1,
      completed: true,
      repsCompleted: 8,
      weightKg: 40,
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        date: TODAY_ISO,
        recommendation_block_exercise_id: 'bex-1',
        exercise_id: 'ex-1',
        block_type: 'lower',
        set_number: 1,
        completed: true,
        reps_completed: 8,
        weight_kg: 40,
      })
    );
  });

  test('updates the existing row when a matching log already exists', async () => {
    const selectChain = mockExistingLookup({ id: 'log-existing' });
    const eqUpdateFn = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn(() => ({ eq: eqUpdateFn }));
    (supabase.from as jest.Mock).mockImplementation(() => ({
      ...selectChain,
      update: updateFn,
    }));

    await upsertExerciseLog({
      date: TODAY,
      recommendationBlockExerciseId: 'bex-1',
      exerciseId: 'ex-1',
      blockType: 'lower',
      setNumber: 1,
      completed: true,
      repsCompleted: 10,
      weightKg: 42.5,
    });

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true, reps_completed: 10, weight_kg: 42.5 })
    );
    expect(eqUpdateFn).toHaveBeenCalledWith('id', 'log-existing');
  });

  test('uses a null set_number lookup/write for a mobility checklist item', async () => {
    const selectChain = mockExistingLookup(null);
    const insertFn = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation(() => ({
      ...selectChain,
      insert: insertFn,
    }));

    await upsertExerciseLog({
      date: TODAY,
      recommendationBlockExerciseId: 'bex-2',
      exerciseId: 'ex-2',
      blockType: 'mobility',
      setNumber: null,
      completed: true,
      repsCompleted: null,
      weightKg: null,
    });

    expect(selectChain.is).toHaveBeenCalledWith('set_number', null);
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ set_number: null, recommendation_block_exercise_id: 'bex-2' })
    );
  });

  test('an ad-hoc exercise (no recommendationBlockExerciseId) looks up/writes by exercise_id + date + set_number', async () => {
    const isFn = jest.fn();
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: null, error: null });
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      is: isFn.mockImplementation(() => chain),
      maybeSingle: maybeSingleFn,
    };
    const insertFn = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation(() => ({ ...chain, insert: insertFn }));

    await upsertExerciseLog({
      date: TODAY,
      recommendationBlockExerciseId: null,
      exerciseId: 'ex-9',
      blockType: 'upper',
      setNumber: 1,
      completed: true,
      repsCompleted: 12,
      weightKg: null,
    });

    expect(isFn).toHaveBeenCalledWith('recommendation_block_exercise_id', null);
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ recommendation_block_exercise_id: null, exercise_id: 'ex-9', set_number: 1 })
    );
  });

  test('throws if the existence lookup returns an error', async () => {
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'lookup failed' } });
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      is: jest.fn(() => chain),
      maybeSingle: maybeSingleFn,
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(
      upsertExerciseLog({
        date: TODAY,
        recommendationBlockExerciseId: 'bex-1',
        exerciseId: 'ex-1',
        blockType: 'lower',
        setNumber: 1,
        completed: true,
        repsCompleted: null,
        weightKg: null,
      })
    ).rejects.toThrow('lookup failed');
  });

  test('refuses to write a row with no resolvable exercise id, without querying the database', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockClear();

    await expect(
      upsertExerciseLog({
        date: TODAY,
        recommendationBlockExerciseId: 'bex-1',
        exerciseId: '',
        blockType: 'lower',
        setNumber: 1,
        completed: true,
        repsCompleted: 8,
        weightKg: 40,
      })
    ).rejects.toThrow('cannot be logged');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('deleteExerciseLog', () => {
  function mockDeleteChain(result: { error: { message: string } | null }) {
    const eqSetNumberFn = jest.fn().mockResolvedValue(result);
    const isSetNumberFn = jest.fn().mockResolvedValue(result);
    const eqBlockExerciseFn = jest.fn(() => ({ eq: eqSetNumberFn, is: isSetNumberFn }));
    const eqDateFn = jest.fn(() => ({ eq: eqBlockExerciseFn }));
    const deleteFn = jest.fn(() => ({ eq: eqDateFn }));
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteFn });
    return { eqDateFn, eqBlockExerciseFn, eqSetNumberFn, isSetNumberFn };
  }

  test('deletes the row matching the block-exercise id and set number', async () => {
    const { eqBlockExerciseFn, eqSetNumberFn } = mockDeleteChain({ error: null });

    await deleteExerciseLog('bex-1', 2);

    expect(supabase.from).toHaveBeenCalledWith('exercise_logs');
    expect(eqBlockExerciseFn).toHaveBeenCalledWith('recommendation_block_exercise_id', 'bex-1');
    expect(eqSetNumberFn).toHaveBeenCalledWith('set_number', 2);
  });

  test('uses an IS NULL match for a mobility checklist item (setNumber null)', async () => {
    const { isSetNumberFn } = mockDeleteChain({ error: null });

    await deleteExerciseLog('bex-2', null);

    expect(isSetNumberFn).toHaveBeenCalledWith('set_number', null);
  });

  test('throws if the delete returns an error', async () => {
    mockDeleteChain({ error: { message: 'delete failed' } });

    await expect(deleteExerciseLog('bex-1', 1)).rejects.toThrow('delete failed');
  });
});
