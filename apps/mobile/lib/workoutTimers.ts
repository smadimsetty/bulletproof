//
// Hold / switch-sides / rest timers as a pure state machine. Every deadline
// is an absolute epoch-ms timestamp so a backgrounded app that ticks late
// still lands on the right state (spec section 4, "Timers").
export const LEAD_IN_MS = 3000;
export const SWITCH_MS = 5000;

export type HoldTimer =
  | { readonly phase: 'idle' }
  | { readonly phase: 'lead_in'; readonly rowId: string; readonly targetS: number; readonly endsAt: number }
  | {
      readonly phase: 'holding';
      readonly rowId: string;
      readonly targetS: number;
      readonly startedAt: number;
      readonly endsAt: number;
    }
  | { readonly phase: 'switching'; readonly nextRowId: string; readonly nextTargetS: number; readonly endsAt: number };

export type TimerEvent =
  | { readonly type: 'hold_started'; readonly rowId: string }
  | { readonly type: 'hold_completed'; readonly rowId: string; readonly durationS: number }
  | null;

export interface RestTimer {
  readonly endsAt: number;
  readonly totalS: number;
}

export const IDLE: HoldTimer = { phase: 'idle' };

export function startHold(rowId: string, targetS: number, now: number): HoldTimer {
  return { phase: 'lead_in', rowId, targetS, endsAt: now + LEAD_IN_MS };
}

export function startSwitch(nextRowId: string, nextTargetS: number, now: number): HoldTimer {
  return { phase: 'switching', nextRowId, nextTargetS, endsAt: now + SWITCH_MS };
}

function holding(rowId: string, targetS: number, startedAt: number): HoldTimer {
  return { phase: 'holding', rowId, targetS, startedAt, endsAt: startedAt + targetS * 1000 };
}

export function tickHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent } {
  switch (timer.phase) {
    case 'idle':
      return { timer, event: null };
    case 'lead_in':
    case 'switching': {
      if (now < timer.endsAt) return { timer, event: null };
      const rowId = timer.phase === 'lead_in' ? timer.rowId : timer.nextRowId;
      const targetS = timer.phase === 'lead_in' ? timer.targetS : timer.nextTargetS;
      const next = holding(rowId, targetS, timer.endsAt);
      if (next.phase === 'holding' && now >= next.endsAt) {
        return { timer: IDLE, event: { type: 'hold_completed', rowId, durationS: targetS } };
      }
      return { timer: next, event: { type: 'hold_started', rowId } };
    }
    case 'holding':
      if (now < timer.endsAt) return { timer, event: null };
      return { timer: IDLE, event: { type: 'hold_completed', rowId: timer.rowId, durationS: timer.targetS } };
  }
}

export function stopHold(timer: HoldTimer, now: number): { timer: HoldTimer; event: TimerEvent } {
  if (timer.phase !== 'holding') return { timer: IDLE, event: null };
  const elapsed = Math.floor((now - timer.startedAt) / 1000);
  const durationS = Math.min(timer.targetS, Math.max(1, elapsed));
  return { timer: IDLE, event: { type: 'hold_completed', rowId: timer.rowId, durationS } };
}

export function holdRemainingS(timer: HoldTimer, now: number): number {
  if (timer.phase === 'idle') return 0;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

export function startRest(totalS: number, now: number): RestTimer {
  return { endsAt: now + totalS * 1000, totalS };
}

export function adjustRest(rest: RestTimer, deltaS: number, now: number): RestTimer | null {
  const endsAt = rest.endsAt + deltaS * 1000;
  if (endsAt <= now) return null;
  return { endsAt, totalS: Math.max(1, rest.totalS + deltaS) };
}

export function restRemainingS(rest: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
}

/** The row a hold timer is about to complete or start, if any. */
export function holdTargetRowId(timer: HoldTimer): string | null {
  switch (timer.phase) {
    case 'lead_in':
    case 'holding':
      return timer.rowId;
    case 'switching':
      return timer.nextRowId;
    default:
      return null;
  }
}
