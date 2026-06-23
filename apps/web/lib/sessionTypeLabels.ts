// apps/web/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Ported verbatim from
// apps/mobile/lib/sessionTypeLabels.ts -- deliberately a small static
// lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement, which is the rationale sentence's
// phrasing, not this screen's headline label. See
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decision 3.
import type { SessionType } from './recommendations';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  upper_a: 'Upper Body A',
  upper_b: 'Upper Body B',
  lower_a: 'Lower Body A',
  lower_b: 'Lower Body B',
  pickleball: 'Pickleball',
  run: 'Run',
  rest: 'Rest',
  mobility: 'Mobility',
};

// Falls back to 'Unknown' rather than returning undefined: recommendations.ts
// casts raw Supabase JSON to RecommendationPublicRow with no runtime
// validation, so a session_type value that drifts ahead of the SessionType
// union must still render as real text, not the literal string "undefined".
export function labelForSessionType(type: SessionType): string {
  return SESSION_TYPE_LABELS[type] ?? 'Unknown';
}
