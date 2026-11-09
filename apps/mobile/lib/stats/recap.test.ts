// apps/mobile/lib/stats/recap.test.ts
//
// Timestamps are built from local components so the tests are TZ-robust.
import { buildMonthlyRecap } from './recap';
import type { StatsWorkout } from './dataset';

const at = (y: number, m1: number, d: number, h = 12, mi = 0) => new Date(y, m1 - 1, d, h, mi).toISOString();

function w(id: string, day: number, opts?: { month?: number; sprint?: boolean; mins?: number; sets?: Record<string, number> }): StatsWorkout {
  const month = opts?.month ?? 11;
  const mins = opts?.mins ?? 30;
  return {
    id, title: id, source: opts?.sprint ? 'sprint' : 'empty', isSprint: !!opts?.sprint,
    startedAt: at(2026, month, day, 12, 0), endedAt: at(2026, month, day, 12, mins),
    exercises: Object.entries(opts?.sets ?? {}).map(([name, count]) => ({
      exerciseId: name, name, exerciseType: 'strength', unilateral: false,
      sets: Array.from({ length: count }, () => ({
        side: null, setType: 'working' as const, reps: 5, weightKg: 20, durationS: null,
        romValue: null, romUnit: null, completedAt: at(2026, month, day),
      })),
    })),
  };
}

test('empty month is all zeros', () => {
  expect(buildMonthlyRecap([], [], 2026, 10)).toEqual({
    year: 2026, month0: 10, workouts: 0, activeDays: 0, totalMinutes: 0, longestDailyStreak: 0,
    prs: [], topExercises: [], sprintDaysLogged: 0,
  });
});

test('counts only the requested local month; minutes and sprint days', () => {
  const r = buildMonthlyRecap([w('a', 3, { mins: 40 }), w('b', 4, { sprint: true, mins: 20 }), w('x', 28, { month: 10 })], [], 2026, 10);
  expect(r.workouts).toBe(2);
  expect(r.totalMinutes).toBe(60);
  expect(r.sprintDaysLogged).toBe(1);
});

test('longest daily streak across 3 consecutive local days; same-day workouts count once', () => {
  const r = buildMonthlyRecap([w('a', 3), w('a2', 3), w('b', 4), w('c', 5), w('d', 9)], [], 2026, 10);
  expect(r.activeDays).toBe(4);
  expect(r.longestDailyStreak).toBe(3);
});

test('top exercises by completed working sets, max 3, desc', () => {
  const r = buildMonthlyRecap(
    [w('a', 3, { sets: { Squat: 3, Curl: 1, Row: 2 } }), w('b', 4, { sets: { Squat: 2, Plank: 1 } })],
    [],
    2026,
    10
  );
  expect(r.topExercises).toEqual([
    { name: 'Squat', sets: 5 },
    { name: 'Row', sets: 2 },
    { name: 'Curl', sets: 1 },
  ]);
});

test('PR events are filtered to the month', () => {
  const ev = (id: string, month: number) => ({
    workoutId: id, exerciseId: 'e', exerciseName: 'E', side: null, kind: 'most_reps' as const,
    value: 2, unit: 'reps', previous: 1, at: at(2026, month, 10),
  });
  const r = buildMonthlyRecap([], [ev('a', 11), ev('b', 10)], 2026, 10);
  expect(r.prs.map((p) => p.workoutId)).toEqual(['a']);
});
