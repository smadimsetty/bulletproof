// apps/mobile/lib/stats/prs.test.ts
import { computePrEvents, isNewBest, prKey, setCandidates } from './prs';
import type { StatsSet, StatsWorkout } from './dataset';

function set(p: Partial<StatsSet>): StatsSet {
  return {
    side: null, setType: 'working', reps: null, weightKg: null, durationS: null,
    romValue: null, romUnit: null, completedAt: '2026-11-01T10:00:00Z', ...p,
  };
}

let n = 0;
function workout(sets: StatsSet[], opts?: { type?: string; unilateral?: boolean; id?: string }): StatsWorkout {
  n++;
  return {
    id: opts?.id ?? `w${n}`, title: 't', source: 'empty',
    startedAt: `2026-11-0${n}T09:00:00Z`, endedAt: `2026-11-0${n}T10:00:00Z`, isSprint: false,
    exercises: [{ exerciseId: 'e1', name: 'Ex', exerciseType: opts?.type ?? 'mobility_stretch', unilateral: !!opts?.unilateral, sets }],
  };
}
beforeEach(() => { n = 0; });

test('first log is not a PR', () => {
  const { events, bests } = computePrEvents([workout([set({ durationS: 60 })])]);
  expect(events).toEqual([]);
  expect(bests.get(prKey('e1', null, 'longest_hold'))).toEqual({ value: 60, reps: undefined });
});

test('longer hold in a later workout is a PR with previous value', () => {
  const { events } = computePrEvents([workout([set({ durationS: 60 })]), workout([set({ durationS: 75 })])]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: 'longest_hold', value: 75, previous: 60, unit: 's', workoutId: 'w2', side: null });
});

test('two improving sets in one workout give one event with the max', () => {
  const { events } = computePrEvents([
    workout([set({ durationS: 60 })]),
    workout([set({ durationS: 70 }), set({ durationS: 80 })]),
  ]);
  expect(events).toHaveLength(1);
  expect(events[0].value).toBe(80);
});

test('warm-up and incomplete sets are ignored', () => {
  const { events } = computePrEvents([
    workout([set({ durationS: 60 })]),
    workout([set({ durationS: 200, setType: 'warmup' }), set({ durationS: 300, completedAt: null })]),
  ]);
  expect(events).toEqual([]);
});

test('unilateral: left improvement is a left PR only', () => {
  const { events } = computePrEvents([
    workout([set({ side: 'left', durationS: 30 }), set({ side: 'right', durationS: 30 })], { unilateral: true }),
    workout([set({ side: 'left', durationS: 40 }), set({ side: 'right', durationS: 30 })], { unilateral: true }),
  ]);
  expect(events).toHaveLength(1);
  expect(events[0].side).toBe('left');
});

test('ROM is never compared across units', () => {
  const { events } = computePrEvents([
    workout([set({ durationS: 10, romValue: 10, romUnit: 'cm' })]),
    workout([set({ durationS: 10, romValue: 20, romUnit: 'deg' })]),
  ]);
  expect(events).toEqual([]);
  const same = computePrEvents([
    workout([set({ durationS: 10, romValue: 10, romUnit: 'cm' })]),
    workout([set({ durationS: 10, romValue: 12, romUnit: 'cm' })]),
  ]);
  expect(same.events).toMatchObject([{ kind: 'best_rom', value: 12, previous: 10, unit: 'cm' }]);
});

test('heaviest weight: tie on weight with more reps is a PR; lower reps is not', () => {
  const base = workout([set({ weightKg: 50, reps: 5 })], { type: 'strength' });
  const tieMore = workout([set({ weightKg: 50, reps: 6 })], { type: 'strength' });
  const tieLess = workout([set({ weightKg: 50, reps: 4 })], { type: 'strength' });
  expect(computePrEvents([base, tieMore]).events).toMatchObject([{ kind: 'heaviest_weight', value: 50, unit: 'kg' }]);
  expect(computePrEvents([base, tieLess]).events).toEqual([]);
});

test('most_reps for reps-based exercises', () => {
  const { events } = computePrEvents([
    workout([set({ reps: 10 })], { type: 'plyometric' }),
    workout([set({ reps: 12 })], { type: 'plyometric' }),
  ]);
  expect(events).toMatchObject([{ kind: 'most_reps', value: 12, previous: 10, unit: 'reps' }]);
});

test('setCandidates is empty for a warm-up', () => {
  expect(setCandidates('strength', false, set({ weightKg: 40, reps: 5, setType: 'warmup' }))).toEqual([]);
});

test('isNewBest: absent key is false; present key compares', () => {
  const bests = new Map([['k', { value: 10 }]]);
  expect(isNewBest(bests, 'missing', { value: 99 })).toBe(false);
  expect(isNewBest(bests, 'k', { value: 11 })).toBe(true);
  expect(isNewBest(bests, 'k', { value: 10 })).toBe(false);
});

test('weights are rounded to storage precision before comparing', () => {
  const key = prKey('e1', null, 'heaviest_weight');
  const bests = new Map([[key, { value: 61.23, reps: 5 }]]);
  const c1 = setCandidates('strength', false, set({ weightKg: 61.2349, reps: 5 }))[0];
  expect(isNewBest(bests, key, c1)).toBe(false);
  const bests2 = new Map([[key, { value: 102.06, reps: 5 }]]);
  const c2 = setCandidates('strength', false, set({ weightKg: 102.0583, reps: 8 }))[0];
  expect(isNewBest(bests2, key, c2)).toBe(true);
});

test('weight tie-break events carry reps and previousReps', () => {
  const mk = (reps: number) => workout([set({ weightKg: 50, reps })], { type: 'strength' });
  const { events } = computePrEvents([mk(5), mk(8)]);
  expect(events).toMatchObject([{ kind: 'heaviest_weight', value: 50, previous: 50, reps: 8, previousReps: 5 }]);
});
