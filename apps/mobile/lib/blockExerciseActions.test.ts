import { swapBlockExercise, removeBlockExercise, addBlockExercise } from './blockExerciseActions';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

describe('swapBlockExercise', () => {
  test('updates exercise_id and records swapped_from_exercise_id', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    await swapBlockExercise('bex-1', 'ex-new', 'ex-old');

    expect(supabase.from).toHaveBeenCalledWith('recommendation_block_exercises');
    expect(updateFn).toHaveBeenCalledWith({ exercise_id: 'ex-new', swapped_from_exercise_id: 'ex-old' });
    expect(eqFn).toHaveBeenCalledWith('id', 'bex-1');
  });

  test('throws if the update returns an error', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    await expect(swapBlockExercise('bex-1', 'ex-new', 'ex-old')).rejects.toThrow('network down');
  });
});

describe('removeBlockExercise', () => {
  test('deletes the row by id', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: null });
    const deleteFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteFn });

    await removeBlockExercise('bex-1');

    expect(eqFn).toHaveBeenCalledWith('id', 'bex-1');
  });

  test('throws if the delete returns an error', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    const deleteFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteFn });

    await expect(removeBlockExercise('bex-1')).rejects.toThrow('network down');
  });
});

describe('addBlockExercise', () => {
  test('inserts a new row with exercise_order one past the current max', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: { id: 'bex-new' }, error: null });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    const result = await addBlockExercise('block-1', 'ex-9', [0, 1, 2]);

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ block_id: 'block-1', exercise_id: 'ex-9', exercise_order: 3 })
    );
    expect(result).toEqual({ id: 'bex-new' });
  });

  test('uses exercise_order 0 when the block currently has no exercises', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: { id: 'bex-new' }, error: null });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    await addBlockExercise('block-1', 'ex-9', []);

    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ exercise_order: 0 }));
  });

  test('throws if the insert returns an error', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    await expect(addBlockExercise('block-1', 'ex-9', [0])).rejects.toThrow('network down');
  });
});
