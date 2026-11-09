// apps/mobile/lib/stats/recap.ts
//
// Monthly recap numbers. Month membership uses the LOCAL time of endedAt
// (same rule as the streak/calendar), so a late-Sunday workout lands in the
// month the athlete lived it in.
import type { StatsWorkout } from './dataset';
import type { PrEvent } from './prs';
import { addDays, localDay, parseYmd, ymd } from './consistency';

export interface MonthlyRecap {
  year: number;
  month0: number;
  workouts: number;
  activeDays: number;
  totalMinutes: number;
  longestDailyStreak: number;
  prs: PrEvent[];
  topExercises: { name: string; sets: number }[];
  sprintDaysLogged: number;
}

function inMonth(iso: string, year: number, month0: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month0;
}

export function buildMonthlyRecap(
  workouts: readonly StatsWorkout[],
  prEvents: readonly PrEvent[],
  year: number,
  month0: number
): MonthlyRecap {
  const mine = workouts.filter((w) => inMonth(w.endedAt, year, month0));

  const days = [...new Set(mine.map((w) => localDay(w.endedAt)))].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev !== null && ymd(addDays(parseYmd(prev), 1)) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }

  const ms = mine.reduce((sum, w) => sum + (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()), 0);

  const setsByExercise = new Map<string, { name: string; sets: number }>();
  for (const w of mine) {
    for (const ex of w.exercises) {
      const done = ex.sets.filter((s) => s.setType === 'working' && s.completedAt != null).length;
      if (done === 0) continue;
      const cur = setsByExercise.get(ex.exerciseId) ?? { name: ex.name, sets: 0 };
      cur.sets += done;
      setsByExercise.set(ex.exerciseId, cur);
    }
  }
  const topExercises = [...setsByExercise.values()]
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name))
    .slice(0, 3);

  return {
    year,
    month0,
    workouts: mine.length,
    activeDays: days.length,
    totalMinutes: Math.round(ms / 60000),
    longestDailyStreak: longest,
    prs: prEvents.filter((e) => inMonth(e.at, year, month0)),
    topExercises,
    sprintDaysLogged: mine.filter((w) => w.isSprint).length,
  };
}
