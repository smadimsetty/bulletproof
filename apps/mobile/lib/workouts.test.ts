// apps/mobile/lib/workouts.test.ts
import {
  sortSets, isPainFlag,
  isInProgressConflict, buildSprintWorkoutExercises, finishWorkout, startSprintWorkout, startWorkout,
  subscribeToActiveWorkoutChanges, discardWorkout, fetchWorkoutHistory, historyCursorFilter, type Workout,
} from './workouts';
import type { SprintDay } from './sprintLifecycle';
import { requestCoach } from './sprintCoach';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./sprintCoach', () => ({ requestCoach: jest.fn() }));
jest.mock('./session', () => ({ getMyId: jest.fn(() => Promise.resolve('me')) }));
import { supabase } from './supabase';

function chain(result: any) {
  const c: any = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'not', 'order', 'range', 'in', 'limit', 'or']) c[m] = jest.fn(() => c);
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  // Awaiting the builder itself (e.g. `await from(t).delete().in(...)`).
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

beforeEach(() => (supabase.from as jest.Mock).mockReset());

const IN_PROGRESS_DUP = { code: '23505', message: 'duplicate key value violates unique constraint "workouts_one_in_progress_per_owner"' };
const SPRINT_DAY_DUP = { code: '23505', message: 'duplicate key value violates unique constraint "workouts_sprint_day_id_key"' };

test('isInProgressConflict only matches the in-progress index', () => {
  expect(isInProgressConflict(IN_PROGRESS_DUP)).toBe(true);
  expect(isInProgressConflict(SPRINT_DAY_DUP)).toBe(false);
  expect(isInProgressConflict({ code: '23503', message: 'workouts_one_in_progress_per_owner' })).toBe(false);
  expect(isInProgressConflict(null)).toBe(false);
});

test('buildSprintWorkoutExercises keeps order and maps prescriptions', () => {
  const day: SprintDay = {
    id: 'd1', sprintId: 's1', dayNumber: 3, date: '2026-11-07', completedAt: null, whyToday: null,
    exercises: [
      { id: 'x2', slotKey: 'b', tier: 2, exerciseId: 'e2', exerciseName: 'B', description: null, prescribedSets: null, prescribedRepsOrDuration: '30s each side', order: 2, completedAt: null, level: null, step: null, leadSide: null, extraSideSet: false },
      { id: 'x1', slotKey: 'a', tier: 1, exerciseId: 'e1', exerciseName: 'A', description: null, prescribedSets: 2, prescribedRepsOrDuration: '15 reps', order: 1, completedAt: null, level: null, step: null, leadSide: null, extraSideSet: false },
    ],
  };
  expect(buildSprintWorkoutExercises(day)).toEqual([
    { exerciseId: 'e1', sprintDayExerciseId: 'x1', targetText: '2 × 15 reps', prescribedSets: 2, leadSide: null, extraSideSet: false },
    { exerciseId: 'e2', sprintDayExerciseId: 'x2', targetText: '30s each side', prescribedSets: null, leadSide: null, extraSideSet: false },
  ]);
});

describe('startWorkout', () => {
  test('success returns id and notifies listeners', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: { id: 'w1' }, error: null }));
    const cb = jest.fn();
    const unsub = subscribeToActiveWorkoutChanges(cb);
    await expect(startWorkout({ source: 'empty', title: 'Evening workout' })).resolves.toEqual({ ok: true, workoutId: 'w1' });
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  test('23505 maps to in_progress with the active id', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chain({ data: null, error: IN_PROGRESS_DUP }))
      .mockReturnValueOnce(chain({ data: { id: 'w0', title: 't', started_at: 'x', sprint_day_id: null }, error: null }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).resolves.toEqual({ ok: false, reason: 'in_progress', activeWorkoutId: 'w0' });
  });

  test('a sprint-day 23505 is not reported as an in-progress workout', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: SPRINT_DAY_DUP }));
    await expect(startWorkout({ source: 'sprint', title: 'x', sprintDayId: 'd1' })).rejects.toThrow('already been logged');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test('other errors throw', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { code: '42501', message: 'denied' } }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).rejects.toThrow('denied');
  });
});

/** Queue one chain per supabase.from() call, recording the table names. */
function queue(...steps: { table: string; result: any }[]) {
  const tables: string[] = [];
  const chains: any[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const step = steps[chains.length];
    if (!step) throw new Error(`unexpected from('${table}') call #${chains.length + 1}`);
    expect(table).toBe(step.table);
    const c = chain(step.result);
    tables.push(table);
    chains.push(c);
    return c;
  });
  return { tables, chains };
}
const OK = { data: null, error: null };

function set(id: string, setNumber: number, side: 'left' | 'right' | null, completedAt: string | null) {
  return { id, setNumber, side, setType: 'working' as const, reps: null, weightKg: null, durationS: 30, romValue: null, romUnit: null, completedAt };
}

const sprintWorkout: Workout = {
  id: 'w1', ownerId: 'me', visibility: 'private', copiedFromWorkoutId: null, media: [], title: 'Neck · Day 14', notes: null, source: 'sprint', sprintDayId: 'd14', routineId: null, painPointId: null,
  startedAt: '2026-11-07T10:00:00Z', endedAt: null,
  exercises: [
    {
      id: 'we1', exerciseId: 'e1', exerciseName: 'Chin tuck', exerciseType: 'mobility_stretch', unilateral: false, description: null,
      position: 1, targetText: null, measureRom: false, sprintDayExerciseId: 'sde1',
      sets: [set('s1', 1, null, 'x'), set('s2', 2, null, null)],
    },
    {
      id: 'we2', exerciseId: 'e2', exerciseName: 'Couch stretch', exerciseType: 'mobility_stretch', unilateral: true, description: null,
      position: 2, targetText: null, measureRom: false, sprintDayExerciseId: 'sde2',
      sets: [set('s3', 1, 'left', null)],
    },
  ],
};
const finishInput = {
  title: '  ', notes: ' felt fine ', effort: 'easy' as const, pain: 0 as number | null, painArea: null as string | null,
  reactionNote: '', visibility: 'private' as const,
};
const SAVED = { result: 'saved', painFlag: false };
const DAY_14 = { data: { id: 'd14', day_number: 14, sprint_id: 'sp1' }, error: null };

describe('finishWorkout', () => {
  test('active sprint: deletes, completes, transitions, feedback, and writes ended_at last', async () => {
    const { tables, chains } = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'active' }, error: null } },
      { table: 'sprint_day_exercises', result: OK },
      { table: 'sprint_days', result: OK },
      { table: 'sprints', result: OK },
      { table: 'sprint_day_feedback', result: OK },
      { table: 'workouts', result: OK }
    );
    await expect(finishWorkout(sprintWorkout, finishInput)).resolves.toEqual(SAVED);
    expect(tables).toHaveLength(9);
    expect(chains[0].in).toHaveBeenCalledWith('id', ['s2', 's3']);
    expect(chains[1].in).toHaveBeenCalledWith('id', ['we2']);
    expect(chains[4].eq).toHaveBeenCalledWith('id', 'sde1');
    expect(chains[6].update).toHaveBeenCalledWith({ status: 'pending_reassessment' });
    expect(chains[8].update.mock.calls[0][0]).toEqual({ title: 'Neck · Day 14', notes: 'felt fine', visibility: 'private', ended_at: expect.any(String) });
  });

  test('a failure mid-sequence never writes ended_at', async () => {
    const { tables } = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'active' }, error: null } },
      { table: 'sprint_day_exercises', result: OK },
      { table: 'sprint_days', result: { data: null, error: { message: 'network down' } } }
    );
    await expect(finishWorkout(sprintWorkout, finishInput)).rejects.toThrow('network down');
    expect(tables).not.toContain('workouts');
  });

  test('a retry after day 14 already moved the sprint on still saves the workout', async () => {
    const { tables, chains } = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'pending_reassessment' }, error: null } },
      { table: 'sprint_day_feedback', result: OK },
      { table: 'workouts', result: OK }
    );
    await expect(finishWorkout(sprintWorkout, finishInput)).resolves.toEqual(SAVED);
    expect(tables[tables.length - 1]).toBe('workouts');
    expect(chains[5].update.mock.calls[0][0].ended_at).toEqual(expect.any(String));
  });

  test('an abandoned sprint is never revived: only the workout is saved', async () => {
    const { tables } = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'abandoned' }, error: null } },
      { table: 'workouts', result: OK }
    );
    await expect(finishWorkout(sprintWorkout, finishInput)).resolves.toEqual(SAVED);
    expect(tables).toEqual(['workout_sets', 'workout_exercises', 'sprint_days', 'sprints', 'workouts']);
  });

  const feedbackRun = (input: typeof finishInput) => {
    const q = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'pending_reassessment' }, error: null } },
      ...(input.effort != null || input.pain != null ? [{ table: 'sprint_day_feedback', result: OK }] : []),
      { table: 'workouts', result: OK }
    );
    return { q, run: finishWorkout(sprintWorkout, input) };
  };

  test('effort without pain saves feedback with pain null', async () => {
    const { q, run } = feedbackRun({ ...finishInput, effort: 'easy', pain: null });
    await expect(run).resolves.toEqual(SAVED);
    expect(q.chains[4].upsert.mock.calls[0][0]).toMatchObject({ sprint_day_id: 'd14', effort: 'easy', pain: null, pain_area: null });
  });

  test('a note alone is still saved (review #10)', async () => {
    const q = queue(
      { table: 'workout_sets', result: OK },
      { table: 'workout_exercises', result: OK },
      { table: 'sprint_days', result: DAY_14 },
      { table: 'sprints', result: { data: { status: 'pending_reassessment' }, error: null } },
      { table: 'sprint_day_feedback', result: OK },
      { table: 'workouts', result: OK }
    );
    await expect(finishWorkout(sprintWorkout, { ...finishInput, effort: null as any, pain: null, reactionNote: 'calf felt tight' })).resolves.toEqual(SAVED);
    expect(q.chains[4].upsert.mock.calls[0][0]).toMatchObject({ effort: null, pain: null, note: 'calf felt tight' });
  });

  test('no effort and no pain writes no feedback row', async () => {
    const { q, run } = feedbackRun({ ...finishInput, effort: null as any, pain: null });
    await expect(run).resolves.toEqual(SAVED);
    expect(q.tables).not.toContain('sprint_day_feedback');
  });

  test('pain above 5 raises the pain flag and asks the coach for a pain adjustment', async () => {
    (requestCoach as jest.Mock).mockClear();
    const { run } = feedbackRun({ ...finishInput, effort: 'right' as any, pain: 6 });
    await expect(run).resolves.toEqual({ result: 'saved', painFlag: true });
    expect(requestCoach).toHaveBeenCalledWith('pain', 'sp1');
  });

  test('no pain flag, no coach call', async () => {
    (requestCoach as jest.Mock).mockClear();
    const { run } = feedbackRun({ ...finishInput, effort: 'easy', pain: 1 });
    await run;
    expect(requestCoach).not.toHaveBeenCalled();
  });

  test('pain 4 in a named area raises the pain flag', async () => {
    const { run } = feedbackRun({ ...finishInput, effort: 'right' as any, pain: 4, painArea: 'ankle' });
    await expect(run).resolves.toEqual({ result: 'saved', painFlag: true });
  });

  test('no completed sets: refuses and writes nothing', async () => {
    const none: Workout = { ...sprintWorkout, exercises: [sprintWorkout.exercises[1]] };
    await expect(finishWorkout(none, finishInput)).resolves.toEqual({ result: 'no_completed_sets', painFlag: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('startSprintWorkout', () => {
  const day: SprintDay = {
    id: 'd3', sprintId: 'sp1', dayNumber: 3, date: '2026-11-07', completedAt: null, whyToday: null,
    exercises: [{ id: 'sde1', slotKey: 'a', tier: 1, exerciseId: 'e1', exerciseName: 'A', description: null, prescribedSets: 2, prescribedRepsOrDuration: '30s', order: 1, completedAt: null, level: null, step: null, leadSide: null, extraSideSet: false }],
  };

  test('resumes the existing in-progress workout for that day instead of creating one', async () => {
    const { tables } = queue({ table: 'workouts', result: { data: { id: 'w9' }, error: null } });
    await expect(startSprintWorkout(day, 'Neck')).resolves.toEqual({ ok: true, workoutId: 'w9' });
    expect(tables).toEqual(['workouts']);
  });

  test('deletes the new workout and rethrows when adding exercises fails', async () => {
    const cb = jest.fn();
    const unsub = subscribeToActiveWorkoutChanges(cb);
    const { tables, chains } = queue(
      { table: 'workouts', result: { data: null, error: null } },
      { table: 'workouts', result: { data: { id: 'w1' }, error: null } },
      { table: 'workout_exercises', result: { data: [], error: null } },
      { table: 'exercises', result: { data: null, error: { message: 'meta failed' } } },
      { table: 'workouts', result: OK }
    );
    await expect(startSprintWorkout(day, 'Neck')).rejects.toThrow('meta failed');
    expect(tables).toHaveLength(5);
    expect(chains[4].delete).toHaveBeenCalled();
    expect(chains[4].eq).toHaveBeenCalledWith('id', 'w1');
    expect(cb).toHaveBeenCalledTimes(2); // started, then cleaned up
    unsub();
  });
});

describe('discardWorkout', () => {
  test('a sprint workout reverts the day and its exercises before deleting', async () => {
    const { tables, chains } = queue(
      { table: 'workouts', result: { data: { sprint_day_id: 'd3' }, error: null } },
      { table: 'sprint_days', result: { data: { day_number: 3, sprint_id: 's1' }, error: null } },
      { table: 'sprints', result: { data: { status: 'active' }, error: null } },
      { table: 'sprint_days', result: OK },
      { table: 'sprint_day_exercises', result: OK },
      { table: 'workouts', result: OK }
    );
    await discardWorkout('w1');
    expect(tables).toEqual(['workouts', 'sprint_days', 'sprints', 'sprint_days', 'sprint_day_exercises', 'workouts']);
    expect(chains[3].update).toHaveBeenCalledWith({ completed_at: null });
    expect(chains[3].eq).toHaveBeenCalledWith('id', 'd3');
    expect(chains[4].update).toHaveBeenCalledWith({ completed_at: null });
    expect(chains[4].eq).toHaveBeenCalledWith('sprint_day_id', 'd3');
    expect(chains[5].delete).toHaveBeenCalled();
  });

  test('day 14 left in pending_reassessment with no reassessment reactivates the sprint', async () => {
    const { tables, chains } = queue(
      { table: 'workouts', result: { data: { sprint_day_id: 'd14' }, error: null } },
      { table: 'sprint_days', result: { data: { day_number: 14, sprint_id: 's1' }, error: null } },
      { table: 'sprints', result: { data: { status: 'pending_reassessment' }, error: null } },
      { table: 'sprint_assessments', result: { data: [], error: null } },
      { table: 'sprint_days', result: OK },
      { table: 'sprint_day_exercises', result: OK },
      { table: 'sprints', result: OK },
      { table: 'workouts', result: OK }
    );
    await discardWorkout('w1');
    expect(tables[6]).toBe('sprints');
    expect(chains[6].update).toHaveBeenCalledWith({ status: 'active' });
    expect(chains[6].eq).toHaveBeenCalledWith('id', 's1');
    expect(chains[7].delete).toHaveBeenCalled();
  });

  test('a completed sprint is not reverted, the workout is just deleted', async () => {
    const { tables } = queue(
      { table: 'workouts', result: { data: { sprint_day_id: 'd14' }, error: null } },
      { table: 'sprint_days', result: { data: { day_number: 14, sprint_id: 's1' }, error: null } },
      { table: 'sprints', result: { data: { status: 'completed' }, error: null } },
      { table: 'workouts', result: OK }
    );
    await discardWorkout('w1');
    expect(tables).toEqual(['workouts', 'sprint_days', 'sprints', 'workouts']);
  });

  test('a non-sprint workout only deletes', async () => {
    const { tables } = queue(
      { table: 'workouts', result: { data: { sprint_day_id: null }, error: null } },
      { table: 'workouts', result: OK }
    );
    await discardWorkout('w1');
    expect(tables).toEqual(['workouts', 'workouts']);
  });
});

describe('fetchWorkoutHistory', () => {
  test('first page has no cursor filter', async () => {
    const { chains } = queue({ table: 'workouts', result: { data: [], error: null } });
    await fetchWorkoutHistory(null, 30);
    expect(chains[0].or).not.toHaveBeenCalled();
    expect(chains[0].order).toHaveBeenCalledWith('id', { ascending: false });
    expect(chains[0].limit).toHaveBeenCalledWith(30);
  });

  test('a cursor adds the ended_at/id keyset filter', async () => {
    const { chains } = queue({ table: 'workouts', result: { data: [], error: null } });
    await fetchWorkoutHistory({ endedAt: '2026-11-07T10:00:00Z', id: 'w5' }, 30);
    const expected = 'ended_at.lt.2026-11-07T10:00:00Z,and(ended_at.eq.2026-11-07T10:00:00Z,id.lt.w5)';
    expect(chains[0].or).toHaveBeenCalledWith(expected);
    expect(historyCursorFilter({ endedAt: '2026-11-07T10:00:00Z', id: 'w5' })).toBe(expected);
  });
});

describe('sortSets', () => {
  const row = (setNumber: number, side: 'left' | 'right' | null) => ({
    id: `${setNumber}${side}`, setNumber, side, setType: 'working' as const, reps: null, weightKg: null,
    durationS: null, romValue: null, romUnit: null, completedAt: null,
  });
  test('left before right by default', () => {
    expect(sortSets([row(1, 'right'), row(1, 'left')]).map((s: any) => s.side)).toEqual(['left', 'right']);
  });
  test('the lead side goes first within each set number', () => {
    expect(sortSets([row(2, 'left'), row(1, 'left'), row(2, 'right'), row(1, 'right'), row(3, 'right')], 'right').map((s: any) => s.id))
      .toEqual(['1right', '1left', '2right', '2left', '3right']);
  });
});

test('buildSprintWorkoutExercises carries the lead side and extra set', () => {
  const day: SprintDay = {
    id: 'd1', sprintId: 's1', dayNumber: 3, date: '2026-11-07', completedAt: null, whyToday: null,
    exercises: [{ id: 'x1', slotKey: 'a', tier: 1, exerciseId: 'e1', exerciseName: 'A', description: null, prescribedSets: 2, prescribedRepsOrDuration: '15 reps', order: 1, completedAt: null, level: 1, step: 1, leadSide: 'right', extraSideSet: true }],
  };
  expect(buildSprintWorkoutExercises(day)[0]).toMatchObject({ leadSide: 'right', extraSideSet: true });
});

describe('isPainFlag', () => {
  test.each([
    [6, null, true], [5, null, false], [4, 'ankle', true], [3, 'ankle', false], [null, 'ankle', false], [10, 'other', true],
  ])('pain %s area %s -> %s', (pain, area, flag) => expect(isPainFlag(pain as any, area as any)).toBe(flag));
});
