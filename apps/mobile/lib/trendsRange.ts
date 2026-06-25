// Pure time-range helpers for the Trends screen. Each range is a rolling
// window ending today (not a calendar-aligned month/year) -- see design
// spec Decision 3. Kept dependency-free of supabase/RN so every function
// here is trivially unit-testable.
import { localDateString } from './healthkitMapping';

export type TimeRange = 'week' | 'month' | '6mo' | 'year';

const RANGE_DAYS: Record<TimeRange, number> = {
  week: 7,
  month: 30,
  '6mo': 182,
  year: 365,
};

export function rangeDays(range: TimeRange): number {
  return RANGE_DAYS[range];
}

export interface DateRangeBounds {
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * [today - N days, today], inclusive on both ends, as local calendar-date
 * strings (YYYY-MM-DD) -- matches the date columns on recovery/sessions/
 * exercise_logs, which are local training dates, not UTC instants.
 */
export function dateRangeBounds(range: TimeRange, today: Date): DateRangeBounds {
  const start = new Date(today);
  start.setDate(start.getDate() - rangeDays(range));

  return {
    startDate: localDateString(start),
    endDate: localDateString(today),
  };
}

/**
 * Maps a YYYY-MM-DD date string to the Monday that starts its ISO week,
 * also as a YYYY-MM-DD string -- the bucket key for the muscle-group
 * volume chart's weekly bars (design spec Decision 4).
 */
export function isoWeekStart(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return localDateString(date);
}

/**
 * Every date string from startDate to endDate inclusive -- used to give
 * the sleep/training chart a continuous x-axis even on days with no
 * recovery or session row (design spec's sleep-line-overlaid-with-
 * training-strip chart needs gaps to render as gaps, not be skipped).
 */
export function enumerateDateRange(bounds: DateRangeBounds): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${bounds.startDate}T00:00:00`);
  const end = new Date(`${bounds.endDate}T00:00:00`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
