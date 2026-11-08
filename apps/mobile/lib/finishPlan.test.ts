import { planFinish } from './finishPlan';

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
