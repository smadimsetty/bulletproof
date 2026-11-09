// apps/mobile/lib/routines.test.ts
import { mergeRoutineUpdate, routineDiffers, routineFromWorkout, routineTargetText, type Routine } from './routines';
import type { Workout, WorkoutExerciseRow, WorkoutSetRow } from './workouts';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

const set = (setNumber: number, o: Partial<WorkoutSetRow> = {}): WorkoutSetRow => ({
  id: `s${setNumber}${o.side ?? ''}`, setNumber, side: null, setType: 'working', reps: null, weightKg: null, durationS: null,
  romValue: null, romUnit: null, completedAt: '2026-11-08T10:00:00Z', ...o,
});
const we = (exerciseId: string, position: number, sets: WorkoutSetRow[], o: Partial<WorkoutExerciseRow> = {}): WorkoutExerciseRow => ({
  id: `we-${exerciseId}`, exerciseId, exerciseName: exerciseId, exerciseType: 'strength', unilateral: false, description: null,
  position, targetText: null, measureRom: false, sprintDayExerciseId: null, sets, ...o,
});
const workout = (exercises: WorkoutExerciseRow[]): Workout => ({
  id: 'w', title: 'Evening workout', notes: null, source: 'routine', sprintDayId: null, routineId: 'r1', painPointId: null,
  startedAt: '2026-11-08T10:00:00Z', endedAt: '2026-11-08T11:00:00Z', exercises,
});
const routine = (exs: { id: string; sets: number; rest?: number | null; notes?: string | null }[]): Routine => ({
  id: 'r1', folderId: 'f1', title: 'Mine', notes: 'n', position: 0,
  exercises: exs.map((e, i) => ({
    id: `re${i}`, exerciseId: e.id, exerciseName: e.id, exerciseType: 'strength', unilateral: false, position: i + 1,
    targetSets: e.sets, targetReps: 10, targetDurationS: null, targetWeightKg: 40, restS: e.rest ?? null, notes: e.notes ?? null,
  })),
});

describe('routineFromWorkout', () => {
  test('a sided exercise counts each set number once and excludes warm-ups / unfinished rows', () => {
    const w = workout([
      we('a', 1, [
        set(1, { side: 'left', durationS: 30 }), set(1, { side: 'right', durationS: 30 }),
        set(2, { side: 'left', durationS: 45 }), set(2, { side: 'right', durationS: 45 }),
        set(3, { side: 'left', completedAt: null }), set(3, { side: 'right', completedAt: null }),
        set(0, { setType: 'warmup', durationS: 5 }),
      ], { unilateral: true, exerciseType: 'mobility_stretch' }),
    ]);
    const out = routineFromWorkout(w);
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]).toMatchObject({ exerciseId: 'a', position: 1, targetSets: 2, targetDurationS: 45 });
  });

  test('targets come from the last completed set; exercises with no completed working sets are dropped', () => {
    const w = workout([
      we('a', 1, [set(1, { reps: 8, weightKg: 30 }), set(2, { reps: 6, weightKg: 35 })]),
      we('b', 2, [set(1, { completedAt: null, reps: 5 })]),
    ]);
    const out = routineFromWorkout(w);
    expect(out.exercises.map((e) => e.exerciseId)).toEqual(['a']);
    expect(out.exercises[0]).toMatchObject({ targetSets: 2, targetReps: 6, targetWeightKg: 35 });
  });
});

describe('routineDiffers', () => {
  const w = workout([
    we('a', 1, [set(1, { reps: 12, weightKg: 50 }), set(2, { reps: 12, weightKg: 50 })]),
    we('b', 2, [set(1, { reps: 9 })]),
  ]);

  test('values-only changes do not count', () => {
    expect(routineDiffers(routine([{ id: 'a', sets: 2 }, { id: 'b', sets: 1 }]), w)).toBe(false);
  });
  test('an added exercise counts', () => {
    expect(routineDiffers(routine([{ id: 'a', sets: 2 }]), w)).toBe(true);
  });
  test('a removed exercise counts', () => {
    expect(routineDiffers(routine([{ id: 'a', sets: 2 }, { id: 'b', sets: 1 }, { id: 'c', sets: 1 }]), w)).toBe(true);
  });
  test('an extra set counts', () => {
    expect(routineDiffers(routine([{ id: 'a', sets: 3 }, { id: 'b', sets: 1 }]), w)).toBe(true);
  });
  test('a reorder counts', () => {
    expect(routineDiffers(routine([{ id: 'b', sets: 1 }, { id: 'a', sets: 2 }]), w)).toBe(true);
  });
});

test('mergeRoutineUpdate keeps rest/notes and header for exercises that still exist', () => {
  const w = workout([we('b', 1, [set(1, { reps: 9 })]), we('new', 2, [set(1, { reps: 5 })])]);
  const out = mergeRoutineUpdate(routine([{ id: 'a', sets: 2 }, { id: 'b', sets: 1, rest: 90, notes: 'slow' }]), w);
  expect(out).toMatchObject({ id: 'r1', folderId: 'f1', title: 'Mine', notes: 'n' });
  expect(out.exercises.map((e) => [e.exerciseId, e.restS, e.notes])).toEqual([['b', 90, 'slow'], ['new', null, null]]);
});

test('routineTargetText', () => {
  const base = { targetSets: 3, targetReps: null, targetDurationS: null, targetWeightKg: null };
  expect(routineTargetText({ ...base, targetReps: 10 })).toBe('3 × 10');
  expect(routineTargetText({ ...base, targetSets: 2, targetDurationS: 45 })).toBe('2 × 45s');
  expect(routineTargetText({ ...base, targetReps: 10, targetWeightKg: 40 })).toBe('3 × 10 @ 40 kg');
  expect(routineTargetText(base)).toBe('3 sets');
});
