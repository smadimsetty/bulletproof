// supabase/functions/_shared/coachLimits.ts
//
// Who may spend an AI coach call. Pure, tested by the app's jest suite.
// Cap decided by Sohan 2026-11-13: at most 4 Claude calls per user per rolling 24 hours.
// Only calls that reached Claude count (engine_calls rows with token counts), so the
// rules-only fallback never uses up the allowance.
export const DAILY_COACH_CAP = 4;

export function coachBlockReason(input: { aiCallsLast24h: number; premiumStatus: string | null }): string | null {
  if (!input.premiumStatus || input.premiumStatus === 'none') return 'no premium';
  if (input.aiCallsLast24h >= DAILY_COACH_CAP) return `daily cap of ${DAILY_COACH_CAP} reached`;
  return null;
}
