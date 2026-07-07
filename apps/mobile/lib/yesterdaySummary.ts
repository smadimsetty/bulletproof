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
// Sleep comes exclusively from a live, read-only HealthKit query (gated on
// the user's healthkit_sync_enabled toggle) for *last night* -- the night
// ending this morning, not the night ending yesterday morning. Oura is not
// consulted for sleep at all: Oura already writes into HealthKit, and the
// engine's own once-daily Oura API pull happens at a fixed time and never
// retries, so it can miss a date's readiness/sleep entirely even after
// Oura's cloud has it (confirmed live 2026-07-06 -- Oura's own app showed
// a night's sleep the engine's `recovery` row for that date never
// captured, and HealthKit hadn't backfilled it either). Nothing is
// written to `recovery` here regardless -- this is a display-only feature.
//
// Getting "last night" right requires passing `today` (not `yesterday`)
// into fetchHealthKitSleepHoursForDate: that function's window is
// [date-1 noon, date noon], i.e. "the night ending on the morning of
// `date`" -- so `date=today` yields the night of yesterday evening
// through this morning, which is what "last night" means when this card
// is viewed today. Passing `yesterday` (the original, wrong version of
// this file) instead surfaced the night ending *yesterday* morning --
// one full night too early, and effectively unrecoverable if that older
// night was never synced.
//
// Activity stays attributed to yesterday's calendar day (unchanged):
// prefers a logged `sessions` row (richer signal: has a type and
// felt_rating) and falls back to a HealthKit-detected workout from the
// `activity` table, which is already kept in sync by existing app logic.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import { fetchHealthKitSleepHoursForDate, isHealthKitSyncEnabled } from './healthkitSync';
import { labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

/** Sleep hours at/above this count alongside no logged/detected activity
 * yesterday reads as "well rested, light day" -- a good day to push hard. */
const GOOD_SLEEP_HOURS_THRESHOLD = 7;
/** Sleep hours below this reads as short enough to call out regardless of
 * yesterday's activity. */
const LOW_SLEEP_HOURS_THRESHOLD = 6;

export interface YesterdaySleep {
  readonly hours: number | null;
}

export interface YesterdayActivity {
  readonly description: string | null;
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
 * Rules-based, deterministic (no Claude call) observation about last
 * night/yesterday, shown as a second line on the Yesterday card.
 * Deliberately conservative: silent unless sleep crosses a clear
 * threshold, since this is an observation sitting alongside today's
 * actual engine-decided program, not a second recommendation competing
 * with it.
 */
export function buildYesterdayInsightLine(
  sleep: YesterdaySleep,
  activity: YesterdayActivity
): string | null {
  if (sleep.hours == null) {
    return null;
  }
  if (sleep.hours < LOW_SLEEP_HOURS_THRESHOLD) {
    return 'Short on sleep last night — consider easing up today.';
  }
  if (sleep.hours >= GOOD_SLEEP_HOURS_THRESHOLD && activity.description == null) {
    return 'Well rested with a light day yesterday — good day to push hard.';
  }
  return null;
}

/**
 * Pure composition of the final "Yesterday" card message from already-
 * resolved sleep/activity data. Exported and tested directly so the
 * branching logic doesn't need a supabase or HealthKit mock to verify.
 */
export function buildYesterdaySummaryMessage(
  sleep: YesterdaySleep,
  activity: YesterdayActivity
): string {
  const sleepPart =
    sleep.hours != null ? `Slept ${sleep.hours.toFixed(1)}h last night (via Apple Health).` : null;
  const activityPart = activity.description ? `You did ${activity.description} yesterday.` : null;
  const insightPart = buildYesterdayInsightLine(sleep, activity);

  const parts = [sleepPart, activityPart, insightPart].filter(
    (part): part is string => part != null
  );
  return parts.length > 0 ? parts.join(' ') : 'No data from yesterday.';
}

/**
 * `today` (not `yesterday`) is deliberate -- see this module's header
 * comment. fetchHealthKitSleepHoursForDate's window is "the night ending
 * on the morning of the given date", so passing today's date is what
 * yields last night's sleep.
 */
async function fetchLastNightSleep(today: Date): Promise<YesterdaySleep> {
  if (!(await isHealthKitSyncEnabled())) {
    return { hours: null };
  }
  const hours = await fetchHealthKitSleepHoursForDate(today);
  return { hours };
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
 * Fetches last night's sleep + yesterday's activity outcomes and composes
 * the final "Yesterday" card message. `today` is resolved to its local
 * calendar date; activity looks at the calendar day before it, sleep
 * looks at the night ending this morning (see header comment for why
 * these are deliberately different dates).
 */
export async function fetchYesterdaySummaryMessage(today: Date): Promise<string> {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const [sleep, activity] = await Promise.all([
    fetchLastNightSleep(today),
    fetchYesterdayActivity(yesterdayIso),
  ]);

  return buildYesterdaySummaryMessage(sleep, activity);
}
