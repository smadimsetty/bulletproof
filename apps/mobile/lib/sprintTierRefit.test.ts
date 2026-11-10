jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { planTierRefit, type RefitDay, type RefitPoolRow } from './sprintTierRefit';

const pool: RefitPoolRow[] = [
  { slotKey: 'a', exerciseId: 'gym', defaultRank: 1, equipment: ['cable_machine'], prescribedSets: 3, prescribedRepsOrDuration: '10' },
  { slotKey: 'a', exerciseId: 'bw1', defaultRank: 2, equipment: ['bodyweight'], prescribedSets: 2, prescribedRepsOrDuration: '30s' },
  { slotKey: 'a', exerciseId: 'bw2', defaultRank: 3, equipment: ['wall'], prescribedSets: 1, prescribedRepsOrDuration: '45s' },
  { slotKey: 'b', exerciseId: 'gymOnly', defaultRank: 1, equipment: ['barbell'], prescribedSets: 3, prescribedRepsOrDuration: '5' },
];

const day = (exercises: RefitDay['exercises']): RefitDay => ({ id: 'd1', exercises });

test('swaps a disallowed exercise for an allowed one, carrying its prescription', () => {
  const changes = planTierRefit(
    [day([{ id: 'x1', slotKey: 'a', exerciseId: 'gym', equipment: ['cable_machine'], completed: false }])],
    pool, 'basic', new Map()
  );
  expect(changes).toEqual([
    { sprintDayExerciseId: 'x1', fromExerciseId: 'gym', toExerciseId: 'bw1', prescribedSets: 2, prescribedRepsOrDuration: '30s' },
  ]);
});

test('leaves allowed, completed, and no-alternative exercises alone', () => {
  const changes = planTierRefit(
    [day([
      { id: 'x1', slotKey: 'a', exerciseId: 'bw2', equipment: ['wall'], completed: false },
      { id: 'x2', slotKey: 'a', exerciseId: 'gym', equipment: ['cable_machine'], completed: true },
      { id: 'x3', slotKey: 'b', exerciseId: 'gymOnly', equipment: ['barbell'], completed: false },
    ])],
    pool, 'basic', new Map()
  );
  expect(changes).toEqual([]);
});

test('does not pick an exercise the day already has', () => {
  const changes = planTierRefit(
    [day([
      { id: 'x1', slotKey: 'a', exerciseId: 'bw1', equipment: ['bodyweight'], completed: false },
      { id: 'x2', slotKey: 'a', exerciseId: 'gym', equipment: ['cable_machine'], completed: false },
    ])],
    pool, 'basic', new Map()
  );
  expect(changes.map((c) => c.toExerciseId)).toEqual(['bw2']);
});

test('moving up a tier or clearing it changes nothing', () => {
  const days = [day([{ id: 'x1', slotKey: 'a', exerciseId: 'bw1', equipment: ['bodyweight'], completed: false }])];
  expect(planTierRefit(days, pool, 'advanced', new Map())).toEqual([]);
  expect(planTierRefit(days, pool, null, new Map())).toEqual([]);
});
