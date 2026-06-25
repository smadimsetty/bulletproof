// apps/mobile/lib/sessionLifecycle.test.ts
import {
  isActiveSessionConflict,
  fetchActiveSession,
  startSession,
  endSession,
  discardActiveSession,
  submitFeltRating,
} from './sessionLifecycle';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

describe('isActiveSessionConflict', () => {
  test('true for the exact 23505 unique_violation code', () => {
    expect(isActiveSessionConflict({ code: '23505' })).toBe(true);
  });

  test('false for a different error code', () => {
    expect(isActiveSessionConflict({ code: '23503' })).toBe(false);
  });

  test('false for null (no error)', () => {
    expect(isActiveSessionConflict(null)).toBe(false);
  });

  test('false for an error object with no code field', () => {
    expect(isActiveSessionConflict({})).toBe(false);
  });
});

const activeRow = {
  id: 'sess-1',
  date: '2026-06-24',
  type: 'lower',
  started_at: '2026-06-24T18:00:00Z',
  ended_at: null,
  felt_rating: null,
};

describe('fetchActiveSession', () => {
  test('returns the open session row (ended_at is null)', async () => {
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: activeRow, error: null });
    const chain: any = { select: jest.fn(() => chain), is: jest.fn(() => chain), maybeSingle: maybeSingleFn };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchActiveSession();

    expect(supabase.from).toHaveBeenCalledWith('sessions');
    expect(chain.is).toHaveBeenCalledWith('ended_at', null);
    expect(result?.id).toBe('sess-1');
  });

  test('returns null when no session is active', async () => {
    const maybeSingleFn = jest.fn().mockResolvedValue({ data: null, error: null });
    const chain: any = { select: jest.fn(() => chain), is: jest.fn(() => chain), maybeSingle: maybeSingleFn };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    expect(await fetchActiveSession()).toBeNull();
  });
});

describe('startSession', () => {
  test('returns ok:true with the new row on a successful insert', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: activeRow, error: null });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    const result = await startSession('lower');

    expect(result).toEqual({ ok: true, session: expect.objectContaining({ id: 'sess-1' }) });
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'lower', ended_at: null })
    );
  });

  test('returns ok:false, conflict:true on a 23505 violation, without throwing', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "sessions_one_active_per_owner"' } });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    const result = await startSession('lower');

    expect(result).toEqual({ ok: false, conflict: true });
  });

  test('rethrows a non-conflict error', async () => {
    const singleFn = jest.fn().mockResolvedValue({ data: null, error: { code: '08000', message: 'connection failure' } });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const insertFn = jest.fn(() => ({ select: selectFn }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });

    await expect(startSession('lower')).rejects.toThrow('connection failure');
  });
});

describe('endSession', () => {
  test('updates ended_at and returns the updated row', async () => {
    const endedRow = { ...activeRow, ended_at: '2026-06-24T18:45:00Z' };
    const singleFn = jest.fn().mockResolvedValue({ data: endedRow, error: null });
    const selectFn = jest.fn(() => ({ single: singleFn }));
    const eqFn = jest.fn(() => ({ select: selectFn }));
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    const result = await endSession('sess-1');

    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ ended_at: expect.any(String) }));
    expect(eqFn).toHaveBeenCalledWith('id', 'sess-1');
    expect(result.endedAt).toBe('2026-06-24T18:45:00Z');
  });
});

describe('discardActiveSession', () => {
  test('updates ended_at = now() for the given session id', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    await discardActiveSession('sess-1');

    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ ended_at: expect.any(String) }));
    expect(eqFn).toHaveBeenCalledWith('id', 'sess-1');
  });

  test('throws if the update returns an error', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    await expect(discardActiveSession('sess-1')).rejects.toThrow('network down');
  });
});

describe('submitFeltRating', () => {
  test('updates felt_rating for the given session id', async () => {
    const eqFn = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn(() => ({ eq: eqFn }));
    (supabase.from as jest.Mock).mockReturnValue({ update: updateFn });

    await submitFeltRating('sess-1', 8);

    expect(updateFn).toHaveBeenCalledWith({ felt_rating: 8 });
    expect(eqFn).toHaveBeenCalledWith('id', 'sess-1');
  });
});
