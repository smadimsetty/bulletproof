jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { planLadderRefit, type RefitDay } from './sprintTierRefit';
import type { LadderRow } from './engine/dayPlanner';

const lr = (level: number, exerciseId: string, step: number, sets: number, equipment: string[] | null, slotKey = 'a'): LadderRow => ({
  slotKey, level, exerciseId, altRank: 1, step, sets, repsOrDuration: `${sets}x`, equipment, unilateral: false, isStretch: false,
});
const ladder: LadderRow[] = [
  lr(1, 'bw1', 1, 2, null), lr(1, 'bw1', 2, 3, null), lr(1, 'wall1', 1, 1, ['wall']),
  lr(2, 'gym2', 1, 2, ['cable_machine']), lr(2, 'gym2b', 1, 2, ['cable_machine']),
  lr(1, 'gymOnly', 1, 3, ['barbell'], 'b'),
];
const day = (exercises: RefitDay['exercises']): RefitDay => ({ id: 'd1', exercises });
const ex = (id: string, exerciseId: string, equipment: string[] | null, level: number | null, step: number | null, completed = false, slotKey = 'a') =>
  ({ id, slotKey, exerciseId, equipment, completed, level, step });

test('a level-2 exercise with no allowed level-2 alternate drops to a level-1 replacement (Review Focus 3)', () => {
  const changes = planLadderRefit([day([ex('x1', 'gym2', ['cable_machine'], 2, 1)])], ladder, 'basic', new Map());
  expect(changes).toEqual([{
    sprintDayExerciseId: 'x1', fromExerciseId: 'gym2', toExerciseId: 'bw1',
    prescribedSets: 2, prescribedRepsOrDuration: '2x', level: 1, step: 1,
  }]);
});

test('a same-level step is kept when the replacement has it', () => {
  const changes = planLadderRefit([day([ex('x1', 'gymX', ['cable_machine'], 1, 2)])], ladder, 'basic', new Map());
  expect(changes[0]).toMatchObject({ toExerciseId: 'bw1', level: 1, step: 2, prescribedSets: 3 });
});

test('leaves allowed, completed, and no-alternative exercises alone', () => {
  const changes = planLadderRefit(
    [day([
      ex('x1', 'bw1', null, 1, 1),
      ex('x2', 'gym2', ['cable_machine'], 2, 1, true),
      ex('x3', 'gymOnly', ['barbell'], 1, 1, false, 'b'),
    ])],
    ladder, 'basic', new Map(),
  );
  expect(changes).toEqual([]);
});

test('does not pick an exercise the day already has', () => {
  const changes = planLadderRefit(
    [day([ex('x1', 'bw1', null, 1, 1), ex('x2', 'gym2', ['cable_machine'], 2, 1)])],
    ladder, 'basic', new Map(),
  );
  expect(changes.map((c) => c.toExerciseId)).toEqual(['wall1']);
});

test('a pre-engine row (no level) is refitted from the level its exercise sits at', () => {
  const changes = planLadderRefit([day([ex('x1', 'gym2', ['cable_machine'], null, null)])], ladder, 'basic', new Map());
  expect(changes.map((c) => [c.toExerciseId, c.level])).toEqual([['bw1', 1]]);
});

test('moving up a tier or clearing it changes nothing', () => {
  const days = [day([ex('x1', 'gym2', ['cable_machine'], 2, 1)])];
  expect(planLadderRefit(days, ladder, 'advanced', new Map())).toEqual([]);
  expect(planLadderRefit(days, ladder, null, new Map())).toEqual([]);
});
