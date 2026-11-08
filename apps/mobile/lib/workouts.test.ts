// apps/mobile/lib/workouts.test.ts
import { isInProgressConflict, buildSprintWorkoutExercises, startWorkout, subscribeToActiveWorkoutChanges } from './workouts';
import type { SprintDay } from './sprintLifecycle';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
import { supabase } from './supabase';

function chain(result: any) {
  const c: any = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'not', 'order', 'range', 'in', 'limit']) c[m] = jest.fn(() => c);
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

beforeEach(() => (supabase.from as jest.Mock).mockReset());

test('isInProgressConflict', () => {
  expect(isInProgressConflict({ code: '23505' })).toBe(true);
  expect(isInProgressConflict({ code: '23503' })).toBe(false);
  expect(isInProgressConflict(null)).toBe(false);
});

test('buildSprintWorkoutExercises keeps order and maps prescriptions', () => {
  const day: SprintDay = {
    id: 'd1', sprintId: 's1', dayNumber: 3, date: '2026-11-07', completedAt: null,
    exercises: [
      { id: 'x2', slotKey: 'b', tier: 2, exerciseId: 'e2', exerciseName: 'B', prescribedSets: null, prescribedRepsOrDuration: '30s each side', order: 2, completedAt: null },
      { id: 'x1', slotKey: 'a', tier: 1, exerciseId: 'e1', exerciseName: 'A', prescribedSets: 2, prescribedRepsOrDuration: '15 reps', order: 1, completedAt: null },
    ],
  };
  expect(buildSprintWorkoutExercises(day)).toEqual([
    { exerciseId: 'e1', sprintDayExerciseId: 'x1', targetText: '2 × 15 reps', prescribedSets: 2 },
    { exerciseId: 'e2', sprintDayExerciseId: 'x2', targetText: '30s each side', prescribedSets: null },
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
      .mockReturnValueOnce(chain({ data: null, error: { code: '23505', message: 'dup' } }))
      .mockReturnValueOnce(chain({ data: { id: 'w0', title: 't', started_at: 'x', sprint_day_id: null }, error: null }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).resolves.toEqual({ ok: false, reason: 'in_progress', activeWorkoutId: 'w0' });
  });

  test('other errors throw', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { code: '42501', message: 'denied' } }));
    await expect(startWorkout({ source: 'empty', title: 'x' })).rejects.toThrow('denied');
  });
});
