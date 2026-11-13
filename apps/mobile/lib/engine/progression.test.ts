import {
  applyGap, daysBetween, isPainTrendingUp, progressSlot, stepBack, stepUp,
  type DayFeedback, type LadderShape, type SlotOutcome, type SlotState,
} from './progression';

const shape: LadderShape = { maxLevel: 3, stepsAt: (l) => (l === 1 ? 2 : 3) };
const base: SlotState = { slotKey: 's', level: 2, step: 2, rightStreak: 0, hardStreak: 0, lastDoneOn: null };
const out = (f = 1, area = 'ankle'): SlotOutcome => ({ slotKey: 's', area, completedFraction: f });
const fb = (effort: DayFeedback['effort'], pain: number | null, painArea: string | null = null): DayFeedback => ({ effort, pain, painArea });
const run = (s: SlotState, o: SlotOutcome, f: DayFeedback, trend = false) => progressSlot(s, shape, o, f, trend, '2026-11-12');
const pos = (s: SlotState) => [s.level, s.step];

describe('stepUp / stepBack', () => {
  it('steps within level, rolls over, caps', () => {
    expect(pos(stepUp(base, shape))).toEqual([2, 3]);
    expect(pos(stepUp({ ...base, level: 1, step: 2 }, shape))).toEqual([2, 1]);
    expect(pos(stepUp({ ...base, level: 3, step: 3 }, shape))).toEqual([3, 3]);
  });
  it('steps back, rolls to previous last step, floors', () => {
    expect(pos(stepBack(base, shape))).toEqual([2, 1]);
    expect(pos(stepBack({ ...base, step: 1 }, shape))).toEqual([1, 2]);
    expect(pos(stepBack({ ...base, level: 1, step: 1 }, shape))).toEqual([1, 1]);
  });
});

describe('progressSlot', () => {
  it('no_feedback holds, only lastDoneOn changes (streaks kept)', () => {
    const s = { ...base, rightStreak: 1 };
    for (const f of [fb(null, 1), fb('easy', null)]) {
      const r = run(s, out(), f);
      expect(r.reason).toBe('no_feedback');
      expect(r.state).toEqual({ ...s, lastDoneOn: '2026-11-12' });
      expect(r.painFlag).toBe(false);
    }
  });
  it('pain > 5 steps back with flag', () => {
    const r = run(base, out(), fb('easy', 6));
    expect(r.reason).toBe('pain_back');
    expect(r.painFlag).toBe(true);
    expect(pos(r.state)).toEqual([2, 1]);
  });
  it('matching painArea with pain 4 steps back; non-matching holds', () => {
    const r = run(base, out(1, 'ankle'), fb('right', 4, 'ankle'));
    expect(r.reason).toBe('pain_back');
    expect(r.painFlag).toBe(true);
    expect(run(base, out(1, 'ankle'), fb('right', 4, 'neck')).reason).toBe('pain_hold');
  });
  it('pain 3-5 holds', () => {
    for (const p of [3, 5]) {
      const r = run(base, out(), fb('easy', p));
      expect(r.reason).toBe('pain_hold');
      expect(pos(r.state)).toEqual([2, 2]);
    }
  });
  it('pain trend holds', () => {
    const r = run(base, out(), fb('easy', 1), true);
    expect(r.reason).toBe('pain_trend');
    expect(pos(r.state)).toEqual([2, 2]);
  });
  it('incomplete below 0.8, not at 0.8', () => {
    expect(run(base, out(0.79), fb('easy', 0)).reason).toBe('incomplete');
    expect(run(base, out(0.8), fb('right', 0)).reason).toBe('right');
  });
  it('hard holds, second hard steps back', () => {
    const a = run(base, out(), fb('hard', 1));
    expect(a.reason).toBe('hard');
    expect(a.state.hardStreak).toBe(1);
    const b = run(a.state, out(), fb('hard', 1));
    expect(b.reason).toBe('hard_back');
    expect(pos(b.state)).toEqual([2, 1]);
    expect(b.state.hardStreak).toBe(0);
  });
  it('right holds, second right steps up', () => {
    const a = run(base, out(), fb('right', 1));
    expect(a.reason).toBe('right');
    expect(a.state.rightStreak).toBe(1);
    const b = run(a.state, out(), fb('right', 1));
    expect(b.reason).toBe('right_up');
    expect(pos(b.state)).toEqual([2, 3]);
    expect(b.state.rightStreak).toBe(0);
  });
  it('hard resets right streak and vice versa', () => {
    expect(run({ ...base, rightStreak: 1 }, out(), fb('hard', 1)).state.rightStreak).toBe(0);
    expect(run({ ...base, hardStreak: 1 }, out(), fb('right', 1)).state.hardStreak).toBe(0);
  });
  it('easy + pain <= 2 + complete steps up', () => {
    const r = run({ ...base, rightStreak: 1 }, out(1), fb('easy', 2));
    expect(r.reason).toBe('easy_up');
    expect(pos(r.state)).toEqual([2, 3]);
    expect(r.state.rightStreak).toBe(0);
  });
  it('easy at top of ladder stays put', () => {
    const r = run({ ...base, level: 3, step: 3 }, out(1), fb('easy', 2));
    expect(pos(r.state)).toEqual([3, 3]);
  });
  it('overlap: easy with pain 4 is pain_hold, not easy_up', () => {
    const r = run(base, out(1), fb('easy', 4));
    expect(r.reason).toBe('pain_hold');
    expect(pos(r.state)).toEqual([2, 2]);
  });
  it('overlap: pain_back beats trend and incomplete; trend beats pain_hold; incomplete beats hard', () => {
    expect(run(base, out(0.1), fb('hard', 7), true).reason).toBe('pain_back');
    expect(run(base, out(1), fb('easy', 3), true).reason).toBe('pain_trend');
    expect(run(base, out(0.5), fb('hard', 1)).reason).toBe('incomplete');
  });
  it('sets lastDoneOn', () => {
    expect(run(base, out(), fb('right', 1)).state.lastDoneOn).toBe('2026-11-12');
  });
});

describe('applyGap', () => {
  const s = { ...base, lastDoneOn: '2026-01-01' };
  it('null lastActiveOn or <3 days: no action', () => {
    expect(applyGap(s, shape, null, '2026-11-12').reason).toBeNull();
    expect(applyGap(s, shape, '2026-11-10', '2026-11-12').reason).toBeNull();
  });
  it('3-6 days holds', () => {
    const r = applyGap(s, shape, '2026-11-08', '2026-11-12');
    expect(r.reason).toBe('gap_hold');
    expect(r.state).toEqual(s);
  });
  it('10 days is one step back; 30 days at most 3', () => {
    expect(pos(applyGap(s, shape, '2026-11-02', '2026-11-12').state)).toEqual([2, 1]);
    const r = applyGap({ ...base, level: 3, step: 3 }, shape, '2026-10-13', '2026-11-12');
    expect(r.reason).toBe('gap_back');
    expect(pos(r.state)).toEqual([2, 3]); // (3,3) -> (3,2) -> (3,1) -> (2,3)
    const far = applyGap({ ...base, level: 3, step: 3 }, shape, '2026-01-01', '2026-11-12');
    expect(pos(far.state)).toEqual([2, 3]);
  });
  it('measures from lastActiveOn, not the slot lastDoneOn', () => {
    expect(applyGap(s, shape, '2026-11-11', '2026-11-12').reason).toBeNull();
  });
});

describe('daysBetween', () => {
  it('is DST-safe', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
  });
});

describe('isPainTrendingUp', () => {
  it('[3,4,5] a week apart is true', () => {
    expect(isPainTrendingUp([
      { date: '2026-11-01', pain: 3 }, { date: '2026-11-08', pain: 4 }, { date: '2026-11-15', pain: 5 },
    ])).toBe(true);
  });
  it('false when short or only one rise', () => {
    expect(isPainTrendingUp([{ date: '2026-11-01', pain: 3 }, { date: '2026-11-08', pain: 4 }])).toBe(false);
    expect(isPainTrendingUp([
      { date: '2026-11-01', pain: 5 }, { date: '2026-11-08', pain: 4 }, { date: '2026-11-15', pain: 5 },
    ])).toBe(false);
  });
});
