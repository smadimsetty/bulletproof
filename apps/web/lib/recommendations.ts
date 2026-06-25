// apps/web/lib/recommendations.ts
//
// Fetches today's and yesterday's rows from the recommendations_public
// view -- never the base recommendations table, which also carries
// internal_rationale/score_breakdown (private biometric-derived fields,
// per CLAUDE.md's public/private split). Ported from
// apps/mobile/lib/recommendations.ts (same query shape, same
// date-matching logic) -- see
// docs/superpowers/specs/2026-06-22-web-dashboard-design.md Decision 3 for
// why this is a port rather than a shared import, and
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decisions
// 6-7 for the original reasoning behind querying by exact date and
// combining both rows into one request.
import { supabase } from './supabase';

export type SessionType =
  | 'upper'
  | 'lower'
  | 'pickleball'
  | 'run'
  | 'rest'
  | 'mobility';

export type RecommendationPublicRow = {
  date: string;
  top_pick: SessionType;
  runner_up: SessionType | null;
  public_rationale: string;
  generated_at: string;
};

export type RecommendationsResult = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
};

/**
 * Local calendar date (YYYY-MM-DD) in the browser's current timezone --
 * matches Postgres `date` column semantics (a single day, not a
 * UTC-anchored instant). Inlined here rather than imported from a shared
 * module: the mobile app's equivalent (`localDateString` in
 * `apps/mobile/lib/healthkitMapping.ts`) lives in a HealthKit-specific
 * file that has no web equivalent and shouldn't be ported wholesale just
 * for this one helper.
 */
function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetches the recommendations_public rows for `today` and the day before
 * it in a single query, then splits the result by exact date match --
 * "today" means date = today, not "most recent row", so a late/missing
 * cron run shows an explicit not-yet-generated state instead of silently
 * relabeling an older row as today's.
 */
export async function fetchRecommendations(today: Date): Promise<RecommendationsResult> {
  const todayIso = localDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const { data, error } = await supabase
    .from('recommendations_public')
    .select('date, top_pick, runner_up, public_rationale, generated_at')
    .in('date', [todayIso, yesterdayIso]);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecommendationPublicRow[];

  return {
    today: rows.find((row) => row.date === todayIso) ?? null,
    yesterday: rows.find((row) => row.date === yesterdayIso) ?? null,
  };
}
