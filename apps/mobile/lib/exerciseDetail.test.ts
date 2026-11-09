// apps/mobile/lib/exerciseDetail.test.ts
import { metricSeries, romSeries } from './exerciseDetail';
import type { StatsSet, StatsWorkout } from './stats/dataset';

jest.mock('./supabase', () => ({ supabase: {} }));

const set = (p: Partial<StatsSet>): StatsSet => ({
  side: null, setType: 'working', reps: null, weightKg: null, durationS: null,
  romValue: null, romUnit: null, completedAt: '2026-11-01T10:00:00Z', ...p,
});
const workout = (id: string, endedAt: string, sets: StatsSet[], unilateral = false, type = 'mobility_stretch'): StatsWorkout => ({
  id, title: id, source: 'empty', startedAt: endedAt, endedAt, isSprint: false,
  exercises: [{ exerciseId: 'e1', name: 'X', exerciseType: type, unilateral, sets }],
});

test('hold exercise: max durationS per workout, two points', () => {
  const pts = metricSeries(
    [
      workout('a', '2026-11-01T10:00:00Z', [set({ durationS: 30 }), set({ durationS: 45 })]),
      workout('b', '2026-11-03T10:00:00Z', [set({ durationS: 60 })]),
    ],
    'e1'
  );
  expect(pts).toEqual([
    { date: '2026-11-01T10:00:00Z', value: 45, unit: 's' },
    { date: '2026-11-03T10:00:00Z', value: 60, unit: 's' },
  ]);
});

test('unilateral fills left and right separately', () => {
  const [p] = metricSeries(
    [workout('a', '2026-11-01T10:00:00Z', [set({ side: 'left', durationS: 30 }), set({ side: 'right', durationS: 40 })], true)],
    'e1'
  );
  expect(p).toMatchObject({ left: 30, right: 40 });
  expect(p.value).toBeUndefined();
});

test('warm-ups, incomplete sets and other exercises are ignored', () => {
  const pts = metricSeries(
    [workout('a', '2026-11-01T10:00:00Z', [set({ durationS: 99, setType: 'warmup' }), set({ durationS: 99, completedAt: null })])],
    'e1'
  );
  expect(pts).toEqual([]);
  expect(metricSeries([workout('a', '2026-11-01T10:00:00Z', [set({ durationS: 5 })])], 'other')).toEqual([]);
});

test('strength uses weightKg; romSeries keeps only the latest unit', () => {
  const w1 = workout('a', '2026-11-01T10:00:00Z', [set({ weightKg: 50, reps: 5, romValue: 10, romUnit: 'cm' })], false, 'strength');
  const w2 = workout('b', '2026-11-03T10:00:00Z', [set({ weightKg: 55, reps: 5, romValue: 90, romUnit: 'deg' })], false, 'strength');
  expect(metricSeries([w1, w2], 'e1').map((p) => p.value)).toEqual([50, 55]);
  expect(romSeries([w1, w2], 'e1')).toEqual([{ date: '2026-11-03T10:00:00Z', value: 90, unit: 'deg' }]);
  expect(romSeries([workout('c', '2026-11-01T10:00:00Z', [set({ durationS: 5 })])], 'e1')).toEqual([]);
});
