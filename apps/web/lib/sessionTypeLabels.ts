// apps/web/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Ported verbatim from
// apps/mobile/lib/sessionTypeLabels.ts -- deliberately a small static
// lookup separate from engine/rationale.py's own casual in-sentence
// label phrasing, which is the rationale sentence's wording, not this
// screen's headline label. See
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decision 3.
//
// Corrected 2026-06-25 (Phase 8 / web dashboard contract check): this map
// still listed the v1 enum's upper_a/upper_b/lower_a/lower_b values, which
// supabase/migrations/20260623143000_simplify_session_type_enum.sql
// dropped weeks ago in favor of bare upper/lower. The mobile app hit and
// fixed the identical drift in Phase 5 (apps/mobile/lib/
// sessionTypeLabels.ts) when its Home screen became the first mobile
// screen to render a label from this map; this web app's copy had the
// same latent bug because nothing here forced a compile error -- the type
// was self-consistent with its own (stale) values.
import type { SessionType } from './recommendations';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
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
