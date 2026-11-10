import { applyPending, isStaleReload, runOptimistic, withoutSet, withSetCompleted, type PendingOp } from './optimisticSets';
import type { Workout } from './workouts';

function set(id: string, completedAt: string | null = null) {
  return { id, setNumber: 1, side: null, setType: 'working', completedAt, reps: null, weightKg: null, durationS: null, romValue: null, romUnit: null } as any;
}
function workout(): Workout {
  return { id: 'w', exercises: [{ id: 'e', sets: [set('a'), set('b', 't0')] }] } as any;
}
const sets = (w: Workout) => w.exercises[0].sets;

describe('withSetCompleted / withoutSet', () => {
  it('ticks and un-ticks one set without touching the original', () => {
    const w = workout();
    const ticked = withSetCompleted(w, 'a', 't1', { reps: 8, weightKg: null, durationS: null, romValue: null, romUnit: null } as any);
    expect(sets(ticked)[0]).toMatchObject({ completedAt: 't1', reps: 8 });
    expect(sets(w)[0].completedAt).toBeNull();
    expect(sets(withSetCompleted(ticked, 'b', null))[1].completedAt).toBeNull();
  });
  it('removes one set', () => {
    expect(sets(withoutSet(workout(), 'a')).map((s) => s.id)).toEqual(['b']);
  });
});

describe('applyPending', () => {
  it('re-lays pending ops over fresh server data', () => {
    const pending = new Map<string, PendingOp>([
      ['a', { kind: 'complete', completedAt: 't9' }],
      ['b', { kind: 'remove' }],
    ]);
    const out = applyPending(workout(), pending);
    expect(sets(out).map((s) => [s.id, s.completedAt])).toEqual([['a', 't9']]);
  });
  it('returns the same object when nothing is pending', () => {
    const w = workout();
    expect(applyPending(w, new Map())).toBe(w);
  });
});

describe('runOptimistic', () => {
  it('applies synchronously, before the write settles', async () => {
    const pending = new Map<string, PendingOp>();
    let state = 'idle';
    let resolve!: () => void;
    const p = runOptimistic({
      pending, key: 'a', op: { kind: 'complete', completedAt: 't' },
      apply: () => { state = 'done'; },
      write: () => new Promise<void>((r) => { resolve = r; }),
      revert: () => { state = 'idle'; },
    });
    expect(state).toBe('done'); // no await yet
    expect(pending.has('a')).toBe(true);
    resolve();
    expect(await p).toBe('ok');
    expect(state).toBe('done');
    expect(pending.size).toBe(0);
  });

  it('reverts when the write fails', async () => {
    const pending = new Map<string, PendingOp>();
    let state = 'idle';
    const result = await runOptimistic({
      pending, key: 'a', op: { kind: 'remove' },
      apply: () => { state = 'removed'; },
      write: () => Promise.reject(new Error('boom')),
      revert: () => { state = 'idle'; },
    });
    expect(result).toBe('failed');
    expect(state).toBe('idle');
    expect(pending.size).toBe(0);
  });

  it('ignores a second call for the same key while one is in flight', async () => {
    const pending = new Map<string, PendingOp>();
    let resolve!: () => void;
    const write = jest.fn(() => new Promise<void>((r) => { resolve = r; }));
    const apply = jest.fn();
    const first = runOptimistic({ pending, key: 'a', op: { kind: 'remove' }, apply, write, revert: jest.fn() });
    const second = await runOptimistic({ pending, key: 'a', op: { kind: 'remove' }, apply, write, revert: jest.fn() });
    expect(second).toBe('ignored');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});

describe('stale reload guard', () => {
  it('drops a reload that started at or before the last write settled, keeps later ones', () => {
    expect(isStaleReload(3, 3)).toBe(true);
    expect(isStaleReload(2, 3)).toBe(true);
    expect(isStaleReload(4, 3)).toBe(false);
  });
  it('runOptimistic calls onSettled after the op leaves pending, on success and failure', async () => {
    for (const fail of [false, true]) {
      const pending = new Map<string, PendingOp>();
      let heldDuringSettle: boolean | null = null;
      await runOptimistic({
        pending, key: 'a', op: { kind: 'remove' }, apply: () => {}, revert: () => {},
        write: async () => { if (fail) throw new Error('x'); },
        onSettled: () => { heldDuringSettle = pending.has('a'); },
      });
      expect(heldDuringSettle).toBe(false);
    }
  });
});
