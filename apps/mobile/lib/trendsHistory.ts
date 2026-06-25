// Sleep + training-type history for the Trends screen's overlay chart
// (design spec's "sleep line overlaid with a training-type strip").
// `recovery` and `sessions` are fetched as two independent range queries
// (no FK relationship between them to join on) and merged client-side by
// date. See design spec Decision 4's sibling note on `sessions`: when a
// day has more than one logged session, the first row returned wins --
// the same accepted limitation already documented for the engine's
// scoring history.
import { supabase } from './supabase';
import { enumerateDateRange, type DateRangeBounds } from './trendsRange';
import type { SessionType } from './recommendations';

export interface HistoryPoint {
  readonly date: string;
  readonly sleepHrs: number | null;
  readonly sessionType: SessionType | null;
}

interface RawRecoveryRow {
  date: string;
  sleep_hrs: number | null;
}

interface RawSessionRow {
  date: string;
  type: SessionType;
}

/**
 * Pure merge: every date in bounds gets a HistoryPoint, filled from
 * whichever of the two row sets has a matching date, null otherwise.
 * Exported and tested directly so the date-enumeration/lookup logic
 * doesn't need a supabase mock to verify.
 */
export function mergeSleepAndTrainingHistory(
  bounds: DateRangeBounds,
  recoveryRows: readonly RawRecoveryRow[],
  sessionRows: readonly RawSessionRow[]
): HistoryPoint[] {
  const sleepByDate = new Map(recoveryRows.map((row) => [row.date, row.sleep_hrs]));
  const sessionByDate = new Map<string, SessionType>();
  for (const row of sessionRows) {
    if (!sessionByDate.has(row.date)) {
      sessionByDate.set(row.date, row.type);
    }
  }

  return enumerateDateRange(bounds).map((date) => ({
    date,
    sleepHrs: sleepByDate.get(date) ?? null,
    sessionType: sessionByDate.get(date) ?? null,
  }));
}

export async function fetchSleepAndTrainingHistory(bounds: DateRangeBounds): Promise<HistoryPoint[]> {
  const [recoveryResult, sessionsResult] = await Promise.all([
    supabase.from('recovery').select('date, sleep_hrs').gte('date', bounds.startDate).lte('date', bounds.endDate),
    supabase.from('sessions').select('date, type').gte('date', bounds.startDate).lte('date', bounds.endDate),
  ]);

  if (recoveryResult.error) {
    throw new Error(recoveryResult.error.message);
  }
  if (sessionsResult.error) {
    throw new Error(sessionsResult.error.message);
  }

  return mergeSleepAndTrainingHistory(
    bounds,
    (recoveryResult.data ?? []) as unknown as RawRecoveryRow[],
    (sessionsResult.data ?? []) as unknown as RawSessionRow[]
  );
}
