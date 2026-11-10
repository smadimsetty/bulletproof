// Optimistic set updates for the logger. The UI flips immediately (tick / delete), the write runs in the
// background, and a failure puts the previous state back. Pure and framework-free so the rules are testable.
//
// While a write is pending its op sits in a `pending` map; `applyPending` re-lays those ops on top of any
// freshly fetched workout, so a background reload can never undo an optimistic change that has not landed yet.
import type { Workout, WorkoutSetRow } from './workouts';
import type { SetValues } from './setFields';

export type PendingOp =
  | { readonly kind: 'complete'; readonly completedAt: string | null; readonly values?: SetValues }
  | { readonly kind: 'remove' };

function mapSets(w: Workout, fn: (s: WorkoutSetRow) => WorkoutSetRow | null): Workout {
  return {
    ...w,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.flatMap((s) => {
        const next = fn(s);
        return next ? [next] : [];
      }),
    })),
  };
}

/** The workout with one set ticked (completedAt set) or un-ticked (null); optional values are written onto the row. */
export function withSetCompleted(w: Workout, setId: string, completedAt: string | null, values?: SetValues): Workout {
  return mapSets(w, (s) => (s.id === setId ? { ...s, ...(values ?? {}), completedAt } : s));
}

/** The workout without one set. */
export function withoutSet(w: Workout, setId: string): Workout {
  return mapSets(w, (s) => (s.id === setId ? null : s));
}

/** Lay every pending optimistic op over a workout (used on fresh server data). */
export function applyPending(w: Workout, pending: ReadonlyMap<string, PendingOp>): Workout {
  if (pending.size === 0) return w;
  let out = w;
  pending.forEach((op, setId) => {
    out = op.kind === 'remove' ? withoutSet(out, setId) : withSetCompleted(out, setId, op.completedAt, op.values);
  });
  return out;
}

export type OptimisticResult = 'ok' | 'failed' | 'ignored';

/**
 * Apply `apply` synchronously, then await `write`. On failure call `revert` and report 'failed'.
 * A second call for the same key while one is in flight is ignored (nothing applied, nothing written).
 */
export async function runOptimistic(args: {
  pending: Map<string, PendingOp>;
  key: string;
  op: PendingOp;
  apply: () => void;
  write: () => Promise<unknown>;
  revert: () => void;
  /** Called once the write has settled and the op has left `pending` (success or failure). */
  onSettled?: () => void;
}): Promise<OptimisticResult> {
  const { pending, key, op, apply, write, revert, onSettled } = args;
  if (pending.has(key)) return 'ignored';
  pending.set(key, op);
  apply();
  try {
    await write();
    return 'ok';
  } catch {
    pending.delete(key);
    revert();
    return 'failed';
  } finally {
    pending.delete(key);
    onSettled?.();
  }
}

/**
 * A reload that STARTED (sequence number `startedSeq`) at or before the last optimistic write settled may have
 * read the server before that write committed. Applying it would flash the old state back (and re-fire the
 * tick haptic), so it must be dropped. Reload sequence numbers come from a counter bumped at each reload start;
 * `lastSettledSeq` is that counter's value when the most recent write settled.
 */
export function isStaleReload(startedSeq: number, lastSettledSeq: number): boolean {
  return startedSeq <= lastSettledSeq;
}
