// apps/mobile/lib/sprintEngine.test.ts
import { claimRows, completedFraction, computeDayBuild, ensureDayBuilt, initialSlotStates, type BuildInputs } from './sprintEngine';
import type { LadderRow } from './engine/dayPlanner';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('./userSettings', () => ({
  fetchUserSettings: jest.fn(async () => ({ equipmentTier: null, dailyTimeRange: null })),
}));
jest.mock('./sprintLifecycle', () => ({ fetchLastCompletedByExerciseId: jest.fn(async () => new Map()) }));

import { supabase } from './supabase';

// ---------------------------------------------------------------- fixtures

const ladderRow = (slotKey: string, level: number, exerciseId: string, step: number, sets = 2): LadderRow => ({
  slotKey, level, exerciseId, altRank: 1, step, sets, repsOrDuration: '10 reps',
  equipment: null, unilateral: false, isStretch: false,
});

function baseInputs(over: Partial<BuildInputs> = {}): BuildInputs {
  return {
    today: '2026-11-20',
    dayNumber: 2,
    template: [
      { dayNumber: 1, slotKey: 'calf', tier: 1, slotOrder: 1 },
      { dayNumber: 2, slotKey: 'calf', tier: 1, slotOrder: 1 },
      { dayNumber: 2, slotKey: 'balance', tier: 2, slotOrder: 2 },
    ],
    slots: [
      { slotKey: 'calf', area: 'ankle', isStretch: false },
      { slotKey: 'balance', area: 'ankle', isStretch: false },
    ],
    links: [
      { testKey: 'kneewall', slotKey: 'calf', weight: 1 },
      { testKey: 'kneewall', slotKey: 'balance', weight: 0.5 },
    ],
    tests: [{
      testKey: 'kneewall', name: 'knee-to-wall', unit: 'cm', betterDirection: 'higher', rawDirection: 'higher',
      targetValue: 10, noiseThreshold: 1.5, isBilateral: false,
    }],
    baseline: [{ testKey: 'kneewall', left: null, right: null, single: 6 }],
    states: [],
    ladder: [
      ladderRow('calf', 1, 'c1', 1), ladderRow('calf', 1, 'c1', 2, 3),
      ladderRow('calf', 2, 'c2', 1), ladderRow('calf', 2, 'c2', 2, 3),
      ladderRow('balance', 1, 'b1', 1),
    ],
    tier: null,
    timeRange: null,
    adjustments: [],
    pendingDays: [],
    painHistory: [],
    yesterdaySlots: [],
    lastDoneByExercise: new Map(),
    ...over,
  };
}

const stateOf = (r: ReturnType<typeof computeDayBuild>, slotKey: string) =>
  r.states.find((s) => s.slotKey === slotKey)!;

// ---------------------------------------------------------------- pure helpers

describe('claimRows', () => {
  test('only an unbuilt day is claimable', () => {
    expect(claimRows(null)).toBe(true);
    expect(claimRows('2026-11-20T10:00:00Z')).toBe(false);
  });
});

describe('completedFraction', () => {
  test('counts both sides of a one-sided exercise plus the extra weaker-side set', () => {
    expect(completedFraction(2, true, true, 5)).toBe(1);
    expect(completedFraction(2, true, false, 2)).toBe(0.5);
  });
  test('caps at 1 and treats a missing prescription as one set', () => {
    expect(completedFraction(2, false, false, 4)).toBe(1);
    expect(completedFraction(null, false, false, 1)).toBe(1);
  });
});

describe('computeDayBuild', () => {
  test('a user with no feedback rows ever gets a valid day held at the starting level (Review Focus 1)', () => {
    const r = computeDayBuild(baseInputs({
      pendingDays: [{ id: 'd1', date: '2026-11-19', feedback: null, slots: [{ slotKey: 'calf', completedFraction: 1 }] }],
    }));
    expect(r.plan.exercises.map((e) => e.slotKey)).toEqual(['calf', 'balance']);
    expect(stateOf(r, 'calf')).toMatchObject({ level: 1, step: 1, lastDoneOn: '2026-11-19' });
    expect(r.progressedDayIds).toEqual(['d1']);
  });

  test('missing state rows start at level 1 step 1 for every laddered slot', () => {
    const r = computeDayBuild(baseInputs());
    expect(r.states.map((s) => [s.slotKey, s.level, s.step])).toEqual([['balance', 1, 1], ['calf', 1, 1]]);
  });

  test('easy, pain 0, prescription completed steps the slot up and today uses the new step', () => {
    const r = computeDayBuild(baseInputs({
      pendingDays: [{
        id: 'd1', date: '2026-11-19',
        feedback: { effort: 'easy', pain: 0, painArea: null },
        slots: [{ slotKey: 'calf', completedFraction: 1 }],
      }],
    }));
    expect(stateOf(r, 'calf')).toMatchObject({ level: 1, step: 2 });
    expect(r.plan.exercises.find((e) => e.slotKey === 'calf')).toMatchObject({ exerciseId: 'c1', step: 2, sets: 3 });
    // A slot not done that day is untouched.
    expect(stateOf(r, 'balance')).toMatchObject({ level: 1, step: 1, lastDoneOn: null });
  });

  test('pain above 5 steps a slot back', () => {
    const r = computeDayBuild(baseInputs({
      states: [{ slotKey: 'calf', level: 2, step: 1, rightStreak: 0, hardStreak: 0, lastDoneOn: null, gapBackApplied: 0 }],
      pendingDays: [{
        id: 'd1', date: '2026-11-19',
        feedback: { effort: 'right', pain: 7, painArea: null },
        slots: [{ slotKey: 'calf', completedFraction: 1 }],
      }],
    }));
    expect(stateOf(r, 'calf')).toMatchObject({ level: 1, step: 2 });
  });

  test('pending days are progressed oldest first', () => {
    const r = computeDayBuild(baseInputs({
      pendingDays: [
        { id: 'd2', date: '2026-11-19', feedback: { effort: 'right', pain: 0, painArea: null }, slots: [{ slotKey: 'calf', completedFraction: 1 }] },
        { id: 'd1', date: '2026-11-18', feedback: { effort: 'right', pain: 0, painArea: null }, slots: [{ slotKey: 'calf', completedFraction: 1 }] },
      ],
    }));
    // Two "right" sessions in a row -> one step up.
    expect(stateOf(r, 'calf')).toMatchObject({ level: 1, step: 2, rightStreak: 0, lastDoneOn: '2026-11-19' });
    expect(r.progressedDayIds).toEqual(['d1', 'd2']);
  });

  test('a 7+ day gap since the last session steps back once, and rebuilding does not step back again', () => {
    const states = [{ slotKey: 'calf', level: 2, step: 1, rightStreak: 1, hardStreak: 0, lastDoneOn: '2026-11-10', gapBackApplied: 0 }];
    const first = computeDayBuild(baseInputs({ today: '2026-11-18', states }));
    expect(stateOf(first, 'calf')).toMatchObject({ level: 1, step: 2, gapBackApplied: 1, rightStreak: 0 });
    const again = computeDayBuild(baseInputs({ today: '2026-11-19', states: first.states }));
    expect(stateOf(again, 'calf')).toMatchObject({ level: 1, step: 2, gapBackApplied: 1 });
  });

  test('an AI level override moves the slot state (clamped to the ladder) and is marked consumed', () => {
    const r = computeDayBuild(baseInputs({
      adjustments: [{
        id: 'a1', slotKey: 'calf', kind: 'start', levelOverride: 9, prefer: [], avoid: [], priorityDelta: 0,
        createdAt: '2026-11-19T00:00:00Z',
      }],
    }));
    expect(stateOf(r, 'calf')).toMatchObject({ level: 2, step: 1 });
    expect(r.plan.exercises.find((e) => e.slotKey === 'calf')!.exerciseId).toBe('c2');
    expect(r.consumedAdjustmentIds).toEqual(['a1']);
  });

  test('day rows carry the template tier, and order follows the plan', () => {
    const r = computeDayBuild(baseInputs());
    expect(r.rows.map((x) => [x.slot_key, x.tier, x.exercise_order])).toEqual([['calf', 1, 1], ['balance', 2, 2]]);
    expect(r.plan.whyToday).toContain('knee-to-wall');
  });
});

describe('initialSlotStates', () => {
  test('carries over the previous sprint state on the same pain point', () => {
    const prev = [{ slotKey: 'calf', level: 3, step: 2, rightStreak: 1, hardStreak: 0, lastDoneOn: '2026-10-01', gapBackApplied: 0 }];
    const out = initialSlotStates(baseInputs(), prev);
    expect(out.find((s) => s.slotKey === 'calf')).toEqual(prev[0]);
    expect(out.find((s) => s.slotKey === 'balance')).toMatchObject({ level: 1, step: 1 });
  });

  test('a first sprint starts at step 2 where the linked test is already near target', () => {
    const out = initialSlotStates(baseInputs({ baseline: [{ testKey: 'kneewall', left: null, right: null, single: 9.5 }] }), []);
    expect(out.find((s) => s.slotKey === 'calf')).toMatchObject({ level: 1, step: 2 });
    // balance's level 1 has only one step, so it stays at step 1.
    expect(out.find((s) => s.slotKey === 'balance')).toMatchObject({ level: 1, step: 1 });
  });
});

// ---------------------------------------------------------------- data layer (fake client)

type Op = { table: string; op: string; payload?: any; filters: [string, ...any[]][] };

function fakeSupabase(handler: (op: Op) => { data: any; error: any }) {
  const ops: Op[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const op: Op = { table, op: 'select', filters: [] };
    const chain: any = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'lt', 'lte', 'gt', 'order', 'limit']) {
      chain[m] = jest.fn((...args: any[]) => { if (m !== 'select') op.filters.push([m, ...args]); return chain; });
    }
    for (const m of ['insert', 'update', 'upsert', 'delete']) {
      chain[m] = jest.fn((payload?: any) => { op.op = m; op.payload = payload; return chain; });
    }
    const run = () => { ops.push(op); return Promise.resolve(handler(op)); };
    chain.single = jest.fn(run);
    chain.maybeSingle = jest.fn(run);
    chain.then = (res: any, rej: any) => run().then(res, rej);
    return chain;
  });
  return ops;
}

const DAY = { id: 'day-2', sprint_id: 's1', day_number: 2, date: '2026-11-20', built_at: null };

describe('ensureDayBuilt', () => {
  beforeEach(() => (supabase.from as jest.Mock).mockReset());

  test('returns without building when another caller already claimed the day (Review Focus 4)', async () => {
    const ops = fakeSupabase((op) => {
      if (op.table === 'sprint_days' && op.op === 'select') return { data: DAY, error: null };
      if (op.table === 'sprint_days' && op.op === 'update') return { data: [], error: null };
      return { data: [], error: null };
    });
    await ensureDayBuilt('s1', '2026-11-20');
    expect(ops.some((o) => o.table === 'sprint_day_exercises' && o.op === 'insert')).toBe(false);
    const claim = ops.find((o) => o.table === 'sprint_days' && o.op === 'update')!;
    expect(claim.filters).toContainEqual(['is', 'built_at', null]);
  });

  test('returns immediately for a day that is already built', async () => {
    const ops = fakeSupabase(() => ({ data: { ...DAY, built_at: '2026-11-20T08:00:00Z' }, error: null }));
    await ensureDayBuilt('s1', '2026-11-20');
    expect(ops.filter((o) => o.op !== 'select')).toEqual([]);
  });

  test('when the exercise insert fails, the claim is released and the error rethrown', async () => {
    const ops = fakeSupabase((op) => {
      if (op.table === 'sprint_days' && op.op === 'select') {
        // first: the day itself; later: the sprint's day list
        return op.filters.some((f) => f[0] === 'eq' && f[1] === 'date') ? { data: DAY, error: null } : { data: [DAY], error: null };
      }
      if (op.table === 'sprint_days' && op.op === 'update' && 'built_at' in (op.payload ?? {}) && op.payload.built_at !== null) {
        return { data: [{ id: 'day-2' }], error: null };
      }
      if (op.table === 'sprints') return { data: { pain_point_id: 'ankle' }, error: null };
      if (op.table === 'sprint_day_template') {
        return { data: [{ day_number: 2, slot_key: 'calf', tier: 1, slot_order: 1 }], error: null };
      }
      if (op.table === 'sprint_slots') return { data: [{ slot_key: 'calf', area: 'ankle', is_stretch: false }], error: null };
      if (op.table === 'slot_ladder') {
        return {
          data: [{ slot_key: 'calf', level: 1, exercise_id: 'c1', alt_rank: 1, step: 1, sets: 2, reps_or_duration: '10 reps',
            exercises: { equipment_needed: null, unilateral: false } }],
          error: null,
        };
      }
      if (op.table === 'sprint_day_exercises' && op.op === 'insert') return { data: null, error: { message: 'boom' } };
      return { data: [], error: null };
    });
    await expect(ensureDayBuilt('s1', '2026-11-20')).rejects.toThrow('boom');
    const release = ops.find((o) => o.table === 'sprint_days' && o.op === 'update' && o.payload?.built_at === null);
    expect(release).toBeDefined();
    expect(release!.filters).toContainEqual(['eq', 'id', 'day-2']);
  });
});
