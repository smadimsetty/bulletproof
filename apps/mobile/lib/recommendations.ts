// apps/mobile/lib/recommendations.ts
//
// Fetches today's and yesterday's rows from the recommendations_public
// view -- never the base recommendations table, which also carries
// internal_rationale/score_breakdown (private biometric-derived fields,
// per CLAUDE.md's public/private split). See
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decision 1.
import { supabase } from './supabase';

export type SessionType =
  | 'upper_a'
  | 'upper_b'
  | 'lower_a'
  | 'lower_b'
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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the recommendations_public rows for `today` and the day before
 * it in a single query (see design spec Decision 7), then splits the
 * result by exact date match (see design spec Decision 6 -- "today" means
 * date = today, not "most recent row", so a late/missing cron run shows an
 * explicit not-yet-generated state instead of silently relabeling an older
 * row as today's).
 */
export async function fetchRecommendations(today: Date): Promise<RecommendationsResult> {
  const todayIso = toIsoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = toIsoDate(yesterday);

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
