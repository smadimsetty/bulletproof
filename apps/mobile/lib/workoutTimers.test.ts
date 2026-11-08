import {
  IDLE, startHold, startSwitch, tickHold, stopHold, holdRemainingS,
  startRest, adjustRest, restRemainingS, LEAD_IN_MS, SWITCH_MS,
} from './workoutTimers';

const T0 = 1_000_000;

describe('hold timer', () => {
  test('lead-in then holding then completes with target duration', () => {
    let t = startHold('r1', 30, T0);
    expect(t).toEqual({ phase: 'lead_in', rowId: 'r1', targetS: 30, endsAt: T0 + LEAD_IN_MS });
    expect(tickHold(t, T0 + 1000)).toEqual({ timer: t, event: null });

    const started = tickHold(t, T0 + LEAD_IN_MS);
    expect(started.event).toEqual({ type: 'hold_started', rowId: 'r1' });
    t = started.timer;
    expect(t).toEqual({ phase: 'holding', rowId: 'r1', targetS: 30, startedAt: T0 + LEAD_IN_MS, endsAt: T0 + LEAD_IN_MS + 30000 });

    const done = tickHold(t, T0 + LEAD_IN_MS + 30000);
    expect(done).toEqual({ timer: IDLE, event: { type: 'hold_completed', rowId: 'r1', durationS: 30 } });
  });

  test('a late tick (app backgrounded) still completes, never double-fires', () => {
    const t = tickHold(startHold('r1', 10, T0), T0 + LEAD_IN_MS).timer;
    const done = tickHold(t, T0 + 999999);
    expect(done.event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 10 });
    expect(tickHold(done.timer, T0 + 1000000).event).toBeNull();
  });

  test('a late tick during lead-in jumps straight to completion if the hold also elapsed', () => {
    const r = tickHold(startHold('r1', 10, T0), T0 + LEAD_IN_MS + 10000);
    expect(r.event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 10 });
  });

  test('stop early completes with elapsed seconds, minimum 1', () => {
    const t = tickHold(startHold('r1', 60, T0), T0 + LEAD_IN_MS).timer;
    expect(stopHold(t, T0 + LEAD_IN_MS + 12400)).toEqual({ timer: IDLE, event: { type: 'hold_completed', rowId: 'r1', durationS: 12 } });
    expect(stopHold(t, T0 + LEAD_IN_MS + 100).event).toEqual({ type: 'hold_completed', rowId: 'r1', durationS: 1 });
  });

  test('stop during lead-in or switching cancels without an event', () => {
    expect(stopHold(startHold('r1', 30, T0), T0 + 500)).toEqual({ timer: IDLE, event: null });
    expect(stopHold(startSwitch('r2', 30, T0), T0 + 500)).toEqual({ timer: IDLE, event: null });
  });

  test('switching auto-starts the next row (no extra lead-in)', () => {
    const s = startSwitch('r2', 45, T0);
    expect(s).toEqual({ phase: 'switching', nextRowId: 'r2', nextTargetS: 45, endsAt: T0 + SWITCH_MS });
    const r = tickHold(s, T0 + SWITCH_MS);
    expect(r.event).toEqual({ type: 'hold_started', rowId: 'r2' });
    expect(r.timer).toEqual({ phase: 'holding', rowId: 'r2', targetS: 45, startedAt: T0 + SWITCH_MS, endsAt: T0 + SWITCH_MS + 45000 });
  });

  test('remaining seconds rounds up; idle is 0', () => {
    expect(holdRemainingS(startHold('r1', 30, T0), T0 + 100)).toBe(3);
    const h = tickHold(startHold('r1', 30, T0), T0 + LEAD_IN_MS).timer;
    expect(holdRemainingS(h, T0 + LEAD_IN_MS + 100)).toBe(30);
    expect(holdRemainingS(IDLE, T0)).toBe(0);
  });
});

describe('rest timer', () => {
  test('start, remaining, adjust', () => {
    const r = startRest(60, T0);
    expect(r).toEqual({ endsAt: T0 + 60000, totalS: 60 });
    expect(restRemainingS(r, T0 + 30500)).toBe(30);
    expect(adjustRest(r, 15, T0)).toEqual({ endsAt: T0 + 75000, totalS: 75 });
  });
  test('adjusting below now ends the rest', () => {
    expect(adjustRest(startRest(10, T0), -15, T0)).toBeNull();
  });
  test('remaining never negative', () => {
    expect(restRemainingS(startRest(10, T0), T0 + 99999)).toBe(0);
  });
});
