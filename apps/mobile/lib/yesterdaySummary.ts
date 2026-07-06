// apps/mobile/lib/yesterdaySummary.ts
//
// Builds the Home screen's "Yesterday" card content from what actually
// happened the day before -- replacing the old display of
// recommendations.public_rationale, which was yesterday's *forecasted*
// pick ("Recommended: rest -- your rest day was overdue.") rather than
// what actually happened, and read as obviously wrong once shown a day
// later. Sohan's exact spec: if sleep data exists, show sleep; if
// activity exists, show activity; if both, show both; if neither, say so
// honestly -- see CLAUDE.md's most recent status entries for the full ask.
//
// Sleep prefers `recovery` (Oura, written server-side by the nightly
// engine) and falls back to a live, read-only single-day HealthKit query
// only when Oura has no sleep_hrs for the date -- nothing is written to
// `recovery` here (its `source` check constraint only allows
// 'oura'/'manual', not 'healthkit', and this is a display-only feature
// that doesn't warrant a migration). Activity prefers a logged `sessions`
// row (richer signal: has a type and felt_rating) and falls back to a
// HealthKit-detected workout from the `activity` table, which is already
// kept in sync by existing app logic.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import { fetchHealthKitSleepHoursForDate } from './healthkitSync';
import { labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

export interface YesterdaySleep {
  readonly hours: number | null;
  readonly source: 'oura' | 'healthkit' | null;
}

export interface YesterdayActivity {
  readonly description: string | null;
}

interface RawRecoveryRow {
  sleep_hrs: number | null;
}

interface RawSessionRow {
  type: SessionType;
}

interface RawActivityRow {
  workout_count: number;
  workouts: ReadonlyArray<{ activity: string }> | null;
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Pure composition of the final "Yesterday" card message from already-
 * resolved sleep/activity data. Exported and tested directly so the
 * four-way branching logic doesn't need a supabase or HealthKit mock to
 * verify.
 */
export function buildYesterdaySummaryMessage(
  sleep: YesterdaySleep,
  activity: YesterdayActivity
): string {
  const sleepPart =
    sleep.hours != null
      ? `Slept ${sleep.hours.toFixed(1)}h last night${
          sleep.source === 'healthkit' ? ' (via Apple Health)' : ''
        }.`
      : null;
  const activityPart = activity.description ? `You did ${activity.description} yesterday.` : null;

  if (sleepPart && activityPart) {
    return `${sleepPart} ${activityPart}`;
  }
  if (sleepPart) {
    return sleepPart;
  }
  if (activityPart) {
    return activityPart;
  }
  return 'No data from yesterday.';
}

async function fetchYesterdaySleep(dateIso: string, dateForHealthKit: Date): Promise<YesterdaySleep> {
  const { data, error } = await supabase
    .from('recovery')
    .select('sleep_hrs')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const ouraSleepHrs = (data as RawRecoveryRow | null)?.sleep_hrs ?? null;
  if (ouraSleepHrs != null) {
    return { hours: ouraSleepHrs, source: 'oura' };
  }

  const healthKitHours = await fetchHealthKitSleepHoursForDate(dateForHealthKit);
  if (healthKitHours != null) {
    return { hours: healthKitHours, source: 'healthkit' };
  }

  return { hours: null, source: null };
}

async function fetchYesterdayActivity(dateIso: string): Promise<YesterdayActivity> {
  const [sessionsResult, activityResult] = await Promise.all([
    supabase.from('sessions').select('type').eq('date', dateIso),
    supabase.from('activity').select('workout_count, workouts').eq('date', dateIso).maybeSingle(),
  ]);

  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }
  if (activityResult.error) {
    throw new Error(activityResult.error.message);
  }

  const sessionRows = (sessionsResult.data ?? []) as unknown as RawSessionRow[];
  if (sessionRows.length > 0) {
    return { description: labelForSessionType(sessionRows[0].type) };
  }

  const activityRow = activityResult.data as RawActivityRow | null;
  if (activityRow && activityRow.workout_count > 0 && activityRow.workouts && activityRow.workouts.length > 0) {
    const names = activityRow.workouts.map((workout) => capitalize(workout.activity));
    return { description: names.join(', ') };
  }

  return { description: null };
}

/**
 * Fetches yesterday's real sleep + activity outcomes and composes the
 * final "Yesterday" card message. `today` is resolved to its local
 * calendar date and stepped back one day, matching homeProgram.ts's
 * existing local-date convention.
 */
export async function fetchYesterdaySummaryMessage(today: Date): Promise<string> {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const [sleep, activity] = await Promise.all([
    fetchYesterdaySleep(yesterdayIso, yesterday),
    fetchYesterdayActivity(yesterdayIso),
  ]);

  return buildYesterdaySummaryMessage(sleep, activity);
}
