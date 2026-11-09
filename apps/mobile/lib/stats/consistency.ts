// apps/mobile/lib/stats/consistency.ts
//
// Weekly streak + month calendar. Weeks are ISO weeks (Monday-Sunday) in the
// DEVICE's local timezone: a workout finished 11:30pm Sunday local but stored
// as Monday UTC belongs to Sunday's week. All bucketing therefore goes through
// local Date getters, never string slicing of the stored ISO timestamp.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  // Calendar arithmetic on local components, so DST shifts can't skip a day.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** YYYY-MM-DD of the local Monday of `d`'s week. */
export function localWeekStart(d: Date): string {
  const sinceMonday = (d.getDay() + 6) % 7;
  return ymd(addDays(d, -sinceMonday));
}

/** Local YYYY-MM-DD of an ISO timestamp. */
export function localDay(iso: string): string {
  return ymd(new Date(iso));
}

export interface Consistency {
  currentStreak: number;
  bestStreak: number;
  thisWeekCount: number;
  weeklyGoal: number;
}

export function computeConsistency(endedAts: readonly string[], weeklyGoal: number, now: Date): Consistency {
  const perWeek = new Map<string, number>();
  for (const iso of endedAts) {
    const wk = localWeekStart(new Date(iso));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }
  const met = (wk: string) => (perWeek.get(wk) ?? 0) >= weeklyGoal;
  const prevWeek = (wk: string) => ymd(addDays(parseYmd(wk), -7));

  const thisWeek = localWeekStart(now);
  // An unfinished current week never breaks the streak: if it isn't met yet,
  // the streak is whatever run ends last week.
  let cursor = met(thisWeek) ? thisWeek : prevWeek(thisWeek);
  let currentStreak = 0;
  while (met(cursor)) {
    currentStreak++;
    cursor = prevWeek(cursor);
  }

  const metWeeks = [...perWeek.keys()].filter(met).sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const wk of metWeeks) {
    run = prev !== null && prevWeek(wk) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = wk;
  }

  return { currentStreak, bestStreak, thisWeekCount: perWeek.get(thisWeek) ?? 0, weeklyGoal };
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  count: number;
  hasSprint: boolean;
  /** Ids of the workouts that ended on this day, for tap-through. */
  workoutIds: string[];
  isToday: boolean;
}

/** Monday-first weeks covering the month; padding days have inMonth false. */
export function monthGrid(
  year: number,
  month0: number,
  workouts: readonly { id: string; endedAt: string; isSprint: boolean }[],
  now: Date
): CalendarDay[][] {
  const byDay = new Map<string, { count: number; hasSprint: boolean; ids: string[] }>();
  for (const w of workouts) {
    const key = localDay(w.endedAt);
    const cur = byDay.get(key) ?? { count: 0, hasSprint: false, ids: [] };
    cur.count++;
    cur.ids.push(w.id);
    cur.hasSprint = cur.hasSprint || w.isSprint;
    byDay.set(key, cur);
  }

  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  const today = ymd(now);
  let day = parseYmd(localWeekStart(first));
  const weeks: CalendarDay[][] = [];
  while (day <= last) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = ymd(day);
      const hit = byDay.get(date);
      week.push({
        date,
        inMonth: day.getMonth() === month0 && day.getFullYear() === year,
        count: hit?.count ?? 0,
        hasSprint: hit?.hasSprint ?? false,
        workoutIds: hit?.ids ?? [],
        isToday: date === today,
      });
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
