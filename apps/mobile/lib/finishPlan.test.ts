import { dirtyCompletedSets, planFinish } from './finishPlan';
import { EMPTY_SET_VALUES } from './setFields';

test('no completed sets anywhere -> refuse', () => {
  expect(planFinish([{ id: 'e1', sprintDayExerciseId: null, sets: [{ id: 's1', completedAt: null }] }])).toEqual({
    ok: false,
    reason: 'no_completed_sets',
  });
  expect(planFinish([])).toEqual({ ok: false, reason: 'no_completed_sets' });
});

test('deletes uncompleted sets, empty exercises, completes only sprint exercises with work', () => {
  const plan = planFinish([
    { id: 'e1', sprintDayExerciseId: 'sde1', sets: [{ id: 's1', completedAt: 'x' }, { id: 's2', completedAt: null }] },
    { id: 'e2', sprintDayExerciseId: 'sde2', sets: [{ id: 's3', completedAt: null }] },
    { id: 'e3', sprintDayExerciseId: null, sets: [] },
    { id: 'e4', sprintDayExerciseId: null, sets: [{ id: 's4', completedAt: 'x' }] },
  ]);
  expect(plan).toEqual({
    ok: true,
    deleteSetIds: ['s2', 's3'],
    deleteExerciseIds: ['e2', 'e3'],
    sprintDayExerciseIdsToComplete: ['sde1'],
  });
});

test('dirtyCompletedSets returns only completed rows whose draft changed', () => {
  const row = (id: string, completedAt: string | null, reps: number) => ({ ...EMPTY_SET_VALUES, id, completedAt, reps });
  const exercises = [{ sets: [row('s1', 'x', 8), row('s2', 'x', 8), row('s3', null, 8), row('s4', 'x', 8)] }];
  const drafts = {
    s1: { ...EMPTY_SET_VALUES, reps: 10 },
    s2: { ...EMPTY_SET_VALUES, reps: 8 },
    s3: { ...EMPTY_SET_VALUES, reps: 12 },
  };
  expect(dirtyCompletedSets(exercises, drafts)).toEqual([{ id: 's1', values: { ...EMPTY_SET_VALUES, reps: 10 } }]);
});
