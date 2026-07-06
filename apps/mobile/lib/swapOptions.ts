// apps/mobile/lib/swapOptions.ts
//
// Option list for the Home screen's "Swap activity" picker. A static set
// of exactly the six session_type values engine/swap_activity.py (and
// program_builder/scoring underneath it) can actually build a program
// for -- earlier this pulled from user_profile.preferred_split/split_taxonomy/
// activity_taxonomy (Settings' broader "what activities do you do" lookup
// tables), but that surfaced options like "yoga"/"walking"/"tennis" and
// split day_labels like "push"/"pull"/"chest_back" that swap_activity.py's
// VALID_ACTIVITIES would reject outright -- a picker that offers choices
// the backend can't fulfill isn't a real fix. See CLAUDE.md's schema notes:
// session_type is a fixed six-value enum, not the open activity_taxonomy set.
//
// Options within each group are ranked by days since that type was last
// logged (most overdue first) -- Sohan asked for "good activities to switch
// to" based on recent history, not an arbitrary fixed order.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import { SESSION_TYPE_LABELS } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

export interface SwapOption {
  readonly id: SessionType;
  readonly label: string;
}

export interface SwapOptionGroup {
  readonly category: 'strength' | 'cardio' | 'recovery';
  readonly label: string;
  readonly options: readonly SwapOption[];
}

const ALL_TYPES: readonly SessionType[] = ['upper', 'lower', 'pickleball', 'run', 'mobility', 'rest'];
const SESSIONS_LOOKBACK_DAYS = 60;
/** Sentinel "days since" for a type with no logged session in the lookback window -- ranks first (most overdue). */
const NEVER_LOGGED_DAYS_SINCE = 9999;

function option(id: SessionType): SwapOption {
  return { id, label: SESSION_TYPE_LABELS[id] };
}

const GROUP_SHAPE: ReadonlyArray<{ category: SwapOptionGroup['category']; label: string; types: readonly SessionType[] }> = [
  { category: 'strength', label: 'Strength', types: ['upper', 'lower'] },
  { category: 'cardio', label: 'Cardio', types: ['pickleball', 'run'] },
  { category: 'recovery', label: 'Recovery', types: ['mobility', 'rest'] },
];

function daysBetween(earlierIso: string, laterIso: string): number {
  const [ey, em, ed] = earlierIso.split('-').map(Number);
  const [ly, lm, ld] = laterIso.split('-').map(Number);
  const earlier = new Date(ey, em - 1, ed);
  const later = new Date(ly, lm - 1, ld);
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

/**
 * For each of the six session types, the number of days since the most
 * recent session of that type in `sessions` (0 if logged today, a large
 * sentinel if never logged in the lookback window) -- mirrors engine/
 * scoring.py's days_since signal, computed client-side from the same
 * `sessions` table instead of duplicating the Python implementation.
 */
export function daysSinceByType(
  sessions: ReadonlyArray<{ date: string; type: string }>,
  todayIso: string
): Record<SessionType, number> {
  const result = {} as Record<SessionType, number>;
  for (const type of ALL_TYPES) {
    const matchingDates = sessions.filter((s) => s.type === type).map((s) => s.date);
    if (matchingDates.length === 0) {
      result[type] = NEVER_LOGGED_DAYS_SINCE;
      continue;
    }
    const mostRecent = matchingDates.reduce((a, b) => (a > b ? a : b));
    result[type] = daysBetween(mostRecent, todayIso);
  }
  return result;
}

async function fetchRecentSessions(todayIso: string): Promise<ReadonlyArray<{ date: string; type: string }>> {
  const since = new Date(todayIso);
  since.setDate(since.getDate() - SESSIONS_LOOKBACK_DAYS);

  const { data, error } = await supabase
    .from('sessions')
    .select('date, type')
    .gte('date', localDateString(since));

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as ReadonlyArray<{ date: string; type: string }>;
}

export async function fetchSwapOptions(today: Date): Promise<SwapOptionGroup[]> {
  const todayIso = localDateString(today);
  const sessions = await fetchRecentSessions(todayIso);
  const daysSince = daysSinceByType(sessions, todayIso);

  return GROUP_SHAPE.map(({ category, label, types }) => ({
    category,
    label,
    options: [...types].sort((a, b) => daysSince[b] - daysSince[a]).map(option),
  }));
}
