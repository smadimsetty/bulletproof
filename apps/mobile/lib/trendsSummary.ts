// Deterministic, data-driven Trends summary -- not a live Haiku call.
// See design spec Decision 2: a secure LLM-generated version needs a
// Supabase Edge Function holding the Anthropic key (none exists yet,
// and Phase 2 already flagged no key is configured at all), so this
// computes a real sentence from the same aggregates the charts render
// instead of embedding a credential in the app or shipping a stub.
// Swapping in a real Edge-Function-backed call later only needs to
// replace this one function -- the call site (TrendsSummaryCard) only
// cares that it gets a string back.
import type { TimeRange } from './trendsRange';
import type { HistoryPoint } from './trendsHistory';
import type { WeeklyVolumePoint } from './muscleGroupVolume';

export interface TrendsSummaryInput {
  readonly range: TimeRange;
  readonly history: readonly HistoryPoint[];
  readonly weeklyVolume: readonly WeeklyVolumePoint[];
}

function averageSleepClause(history: readonly HistoryPoint[]): string | null {
  const sleepValues = history.map((p) => p.sleepHrs).filter((v): v is number => v != null);
  if (sleepValues.length === 0) {
    return null;
  }
  const avg = sleepValues.reduce((sum, v) => sum + v, 0) / sleepValues.length;
  return `You averaged ${avg.toFixed(1)} hrs of sleep`;
}

function sessionBreakdownClause(history: readonly HistoryPoint[]): string | null {
  const counts = new Map<string, number>();
  for (const point of history) {
    if (point.sessionType) {
      counts.set(point.sessionType, (counts.get(point.sessionType) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return null;
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const breakdown = [...counts.entries()].map(([type, count]) => `${count} ${type}`).join(', ');
  return `trained ${total} session${total === 1 ? '' : 's'} (${breakdown})`;
}

function volumeTrendClause(weeklyVolume: readonly WeeklyVolumePoint[]): string | null {
  const totalsByWeek = new Map<string, number>();
  for (const point of weeklyVolume) {
    totalsByWeek.set(point.weekStart, (totalsByWeek.get(point.weekStart) ?? 0) + point.volume);
  }
  const sortedWeeks = [...totalsByWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  if (sortedWeeks.length < 2) {
    return null;
  }

  const midpoint = Math.ceil(sortedWeeks.length / 2);
  const earlier = sortedWeeks.slice(0, midpoint).reduce((sum, [, v]) => sum + v, 0);
  const later = sortedWeeks.slice(midpoint).reduce((sum, [, v]) => sum + v, 0);

  if (earlier === 0 && later === 0) {
    return null;
  }
  if (later > earlier * 1.1) {
    return 'training volume is trending up';
  }
  if (later < earlier * 0.9) {
    return 'training volume is trending down';
  }
  return 'training volume is holding steady';
}

export function buildTrendsSummary(input: TrendsSummaryInput): string {
  const clauses = [
    averageSleepClause(input.history),
    sessionBreakdownClause(input.history),
    volumeTrendClause(input.weeklyVolume),
  ].filter((clause): clause is string => clause != null);

  if (clauses.length === 0) {
    return 'Not enough data yet for this range.';
  }

  const sentence = `${clauses.join(' and ')}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
