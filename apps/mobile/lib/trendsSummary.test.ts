import { buildTrendsSummary } from './trendsSummary';
import type { HistoryPoint } from './trendsHistory';
import type { WeeklyVolumePoint } from './muscleGroupVolume';

function history(points: ReadonlyArray<Partial<HistoryPoint>>): HistoryPoint[] {
  return points.map((p) => ({ date: '2026-06-22', sleepHrs: null, sessionType: null, ...p }));
}

describe('buildTrendsSummary', () => {
  test('reports average sleep and a session breakdown by type', () => {
    const summary = buildTrendsSummary({
      range: 'week',
      history: history([
        { sleepHrs: 7, sessionType: 'upper' },
        { sleepHrs: 8, sessionType: 'lower' },
        { sleepHrs: 6.5, sessionType: 'upper' },
        { sleepHrs: null, sessionType: null },
      ]),
      weeklyVolume: [],
    });

    expect(summary).toContain('7.2 hrs');
    expect(summary).toContain('3 sessions');
    expect(summary).toContain('2 upper');
    expect(summary).toContain('1 lower');
  });

  test('falls back to a clear message when there is no data at all', () => {
    const summary = buildTrendsSummary({ range: 'month', history: history([{}, {}]), weeklyVolume: [] });
    expect(summary).toBe('Not enough data yet for this range.');
  });

  test('omits the sleep clause when no recovery data exists, still reports sessions', () => {
    const summary = buildTrendsSummary({
      range: 'week',
      history: history([{ sessionType: 'run' }]),
      weeklyVolume: [],
    });
    expect(summary).not.toContain('hrs');
    expect(summary).toContain('1 session');
    expect(summary).toContain('1 run');
  });

  test('omits the session clause when no training data exists, still reports sleep', () => {
    const summary = buildTrendsSummary({
      range: 'week',
      history: history([{ sleepHrs: 7 }, { sleepHrs: 7 }]),
      weeklyVolume: [],
    });
    expect(summary).toContain('7.0 hrs');
    expect(summary).not.toContain('session');
  });

  test('notes an upward volume trend across the range', () => {
    const volumePoints: WeeklyVolumePoint[] = [
      { weekStart: '2026-06-01', bodyPart: 'hips', volume: 500 },
      { weekStart: '2026-06-08', bodyPart: 'hips', volume: 1500 },
    ];
    const summary = buildTrendsSummary({
      range: 'month',
      history: history([{ sessionType: 'lower' }]),
      weeklyVolume: volumePoints,
    });
    expect(summary).toMatch(/volume.*trending up|trending up.*volume/i);
  });

  test('notes a downward volume trend across the range', () => {
    const volumePoints: WeeklyVolumePoint[] = [
      { weekStart: '2026-06-01', bodyPart: 'hips', volume: 1500 },
      { weekStart: '2026-06-08', bodyPart: 'hips', volume: 500 },
    ];
    const summary = buildTrendsSummary({
      range: 'month',
      history: history([{ sessionType: 'lower' }]),
      weeklyVolume: volumePoints,
    });
    expect(summary).toMatch(/trending down/i);
  });
});
