import { estimateSeconds, planDay, TIME_RANGE_BOUNDS, type LadderRow, type CandidateSlot, type TimeRange } from './dayPlanner';
import type { SlotState } from './progression';
import type { EquipmentTier } from '../equipmentTiers';
import type { Side } from './types';

function row(p: Partial<LadderRow> & { slotKey: string; exerciseId: string }): LadderRow {
  return {
    level: 1, altRank: 0, step: 1, sets: 2, repsOrDuration: '10 reps',
    equipment: ['bodyweight'], unilateral: false, isStretch: false, ...p,
  };
}
const slot = (slotKey: string, order: number, area = 'a', isStretch = false): CandidateSlot => ({ slotKey, area, order, isStretch });
const st = (slotKey: string, level = 1, step = 1): SlotState => ({
  slotKey, level, step, rightStreak: 0, hardStreak: 0, lastDoneOn: null, gapBackApplied: 0,
});

function input(over: Record<string, unknown> = {}) {
  return {
    candidates: [] as CandidateSlot[], offRhythm: [] as CandidateSlot[], yesterdaySlots: new Set<string>(),
    priorities: new Map<string, number>(), priorityDelta: new Map<string, number>(),
    states: new Map<string, SlotState>(), levelOverride: new Map<string, number>(),
    ladder: [] as LadderRow[], tier: null as EquipmentTier | null, timeRange: '10-20' as TimeRange | null,
    lastDoneByExercise: new Map<string, string>(), prefer: new Set<string>(), avoid: new Set<string>(),
    weakerSideBySlot: new Map<string, Side>(), testNameBySlot: new Map<string, string>(),
    gapTextBySlot: new Map<string, string>(), ...over,
  };
}

describe('estimateSeconds', () => {
  it('parses the live formats', () => {
    expect(estimateSeconds(1, '20m', false)).toBe(30);
    expect(estimateSeconds(1, '45s', false)).toBe(45);
    expect(estimateSeconds(1, '8-12 reps', false)).toBe(36);
    expect(estimateSeconds(1, '10 reps', false)).toBe(30);
    expect(estimateSeconds(1, '2 min', false)).toBe(120);
    expect(estimateSeconds(1, 'whatever', false)).toBe(30);
  });
  it('adds 30s rest between sets and doubles one-sided', () => {
    expect(estimateSeconds(3, '30s', false)).toBe(3 * 30 + 2 * 30);
    expect(estimateSeconds(3, '30s', true)).toBe(2 * (3 * 30 + 2 * 30));
  });
  it('exposes bounds', () => {
    expect(TIME_RANGE_BOUNDS['5-10']).toEqual({ min: 5, max: 10 });
  });
});

describe('planDay', () => {
  const two = () => ({
    candidates: [slot('s1', 1), slot('s2', 2), slot('s3', 3)],
    priorities: new Map([['s1', 3], ['s2', 2], ['s3', 1]]),
    states: new Map([['s1', st('s1')], ['s2', st('s2')], ['s3', st('s3')]]),
    ladder: [
      row({ slotKey: 's1', exerciseId: 'e1', sets: 3, repsOrDuration: '120s' }),
      row({ slotKey: 's2', exerciseId: 'e2', sets: 3, repsOrDuration: '60s' }),
      row({ slotKey: 's3', exerciseId: 'e3', sets: 3, repsOrDuration: '60s' }),
    ],
  });

  it('5-10 with a 12 minute top slot yields exactly that slot', () => {
    const i = input({ ...two(), timeRange: '5-10' });
    // 3 x 120s + 2 x 30s rest = 420s... make it 12 min
    i.ladder[0] = row({ slotKey: 's1', exerciseId: 'e1', sets: 3, repsOrDuration: '210s' });
    const p = planDay(i);
    expect(p.exercises.map((e) => e.slotKey)).toEqual(['s1']);
    expect(p.exercises[0].estSeconds).toBeGreaterThan(600);
  });

  it('20-30 fills more slots than 10-20', () => {
    const a = planDay(input({ ...two(), timeRange: '10-20' }));
    const l = two();
    l.ladder = l.ladder.map((r) => ({ ...r, sets: 4, repsOrDuration: '90s' }));
    const mid = planDay(input({ ...l, timeRange: '10-20' }));
    const big = planDay(input({ ...l, timeRange: '20-30' }));
    expect(a.exercises.length).toBe(3);
    expect(big.exercises.length).toBeGreaterThan(mid.exercises.length);
  });

  it('caps stretch hold at 240s per area across slots', () => {
    const i = input({
      candidates: [slot('s1', 1, 'hip', true), slot('s2', 2, 'hip', true)],
      priorities: new Map([['s1', 2], ['s2', 1]]),
      states: new Map([['s1', st('s1')], ['s2', st('s2')]]),
      ladder: [
        row({ slotKey: 's1', exerciseId: 'e1', sets: 3, repsOrDuration: '60s', isStretch: true }),
        row({ slotKey: 's2', exerciseId: 'e2', sets: 3, repsOrDuration: '60s', isStretch: true }),
      ],
      timeRange: '20-30',
    });
    const p = planDay(i);
    const hold = p.exercises.reduce((s, e) => s + e.sets * 60, 0);
    expect(hold).toBeLessThanOrEqual(240);
    expect(p.exercises[0].sets).toBe(3);
    expect(p.exercises[1].sets).toBe(1);
  });

  it('skips an over-cap stretch slot that is not the top one', () => {
    const i = input({
      candidates: [slot('s1', 1, 'hip', true), slot('s2', 2, 'hip', true)],
      priorities: new Map([['s1', 2], ['s2', 1]]),
      states: new Map([['s1', st('s1')], ['s2', st('s2')]]),
      ladder: [
        row({ slotKey: 's1', exerciseId: 'e1', sets: 2, repsOrDuration: '120s', isStretch: true }),
        row({ slotKey: 's2', exerciseId: 'e2', sets: 2, repsOrDuration: '120s', isStretch: true }),
      ],
      timeRange: '20-30',
    });
    expect(planDay(i).exercises.map((e) => e.slotKey)).toEqual(['s1']);
  });

  it('falls back to a lower level when the tier rules out the level', () => {
    const i = input({
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]),
      states: new Map([['s1', st('s1', 3)]]), tier: 'basic',
      ladder: [
        row({ slotKey: 's1', exerciseId: 'low', level: 2 }),
        row({ slotKey: 's1', exerciseId: 'high', level: 3, equipment: ['kettlebell'] }),
      ],
    });
    expect(planDay(i).exercises[0].exerciseId).toBe('low');
    expect(planDay(i).exercises[0].level).toBe(2);
  });

  it('rotates: the most recently done alternate loses', () => {
    const i = input({
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]),
      states: new Map([['s1', st('s1')]]),
      ladder: [row({ slotKey: 's1', exerciseId: 'a', altRank: 0 }), row({ slotKey: 's1', exerciseId: 'b', altRank: 1 })],
      lastDoneByExercise: new Map([['a', '2026-11-11'], ['b', '2026-11-01']]),
    });
    expect(planDay(i).exercises[0].exerciseId).toBe('b');
  });

  it('skips avoid when an alternate exists, keeps it otherwise', () => {
    const base = {
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]), states: new Map([['s1', st('s1')]]),
    };
    const alt = input({
      ...base, avoid: new Set(['a']),
      ladder: [row({ slotKey: 's1', exerciseId: 'a' }), row({ slotKey: 's1', exerciseId: 'b', altRank: 1 })],
    });
    expect(planDay(alt).exercises[0].exerciseId).toBe('b');
    const only = input({ ...base, avoid: new Set(['a']), ladder: [row({ slotKey: 's1', exerciseId: 'a' })] });
    expect(planDay(only).exercises[0].exerciseId).toBe('a');
  });

  it('never picks the same exercise twice in a day when an alternative exists', () => {
    const i = input({
      candidates: [slot('s1', 1), slot('s2', 2)],
      priorities: new Map([['s1', 2], ['s2', 1]]),
      states: new Map([['s1', st('s1')], ['s2', st('s2')]]),
      ladder: [
        row({ slotKey: 's1', exerciseId: 'x' }),
        row({ slotKey: 's2', exerciseId: 'x' }),
        row({ slotKey: 's2', exerciseId: 'y', altRank: 1 }),
      ],
    });
    expect(planDay(i).exercises.map((e) => e.exerciseId)).toEqual(['x', 'y']);
  });

  it('uses the step row min(state.step, exercise max step), largest step <= state.step', () => {
    const i = input({
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]),
      states: new Map([['s1', st('s1', 1, 5)]]),
      ladder: [
        row({ slotKey: 's1', exerciseId: 'a', step: 2, sets: 2 }),
        row({ slotKey: 's1', exerciseId: 'a', step: 4, sets: 4 }),
      ],
    });
    const e = planDay(i).exercises[0];
    expect(e.step).toBe(4);
    expect(e.sets).toBe(4);
  });

  it('weaker side on a one-sided exercise leads with an extra set', () => {
    const i = input({
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]), states: new Map([['s1', st('s1')]]),
      ladder: [row({ slotKey: 's1', exerciseId: 'a', unilateral: true, repsOrDuration: '30s' })],
      weakerSideBySlot: new Map<string, Side>([['s1', 'left']]),
      testNameBySlot: new Map([['s1', 'ankle dorsiflexion']]),
      gapTextBySlot: new Map([['s1', '3 cm']]),
    });
    const p = planDay(i);
    expect(p.exercises[0].leadSide).toBe('left');
    expect(p.exercises[0].extraSideSet).toBe(true);
    expect(p.exercises[0].estSeconds).toBe(estimateSeconds(3, '30s', true));
    expect(p.whyToday).toBe('Left side first, plus one extra set: your ankle dorsiflexion gap is 3 cm.');
  });

  it('weaker side on a bilateral exercise gives no lead side', () => {
    const i = input({
      candidates: [slot('s1', 1)], priorities: new Map([['s1', 1]]), states: new Map([['s1', st('s1')]]),
      ladder: [row({ slotKey: 's1', exerciseId: 'a' })],
      weakerSideBySlot: new Map<string, Side>([['s1', 'right']]),
      testNameBySlot: new Map([['s1', 'reach']]),
    });
    const p = planDay(i);
    expect(p.exercises[0].leadSide).toBeNull();
    expect(p.exercises[0].extraSideSet).toBe(false);
    expect(p.whyToday).toBe('Focus today: reach, your biggest gap to target.');
  });

  it('adds off-rhythm slots not done yesterday, in rank order', () => {
    const i = input({
      candidates: [slot('s1', 1)], offRhythm: [slot('o1', 2), slot('o2', 3)],
      yesterdaySlots: new Set(['o1']),
      priorities: new Map([['s1', 3], ['o1', 2], ['o2', 1]]),
      states: new Map([['s1', st('s1')], ['o1', st('o1')], ['o2', st('o2')]]),
      ladder: [row({ slotKey: 's1', exerciseId: 'a' }), row({ slotKey: 'o1', exerciseId: 'b' }), row({ slotKey: 'o2', exerciseId: 'c' })],
    });
    expect(planDay(i).exercises.map((e) => e.slotKey)).toEqual(['s1', 'o2']);
  });
});
