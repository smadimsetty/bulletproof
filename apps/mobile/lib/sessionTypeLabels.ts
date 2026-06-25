// apps/mobile/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Deliberately a small
// static lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement -- this is the screen's headline
// label, not the rationale sentence. See design spec Decision 3.
//
// Corrected 2026-06-24 (Phase 5 / home-screen-design.md): the previous
// version of this map still listed the v1 enum's upper_a/upper_b/lower_a/
// lower_b values, which supabase/migrations/20260623143000_simplify_
// session_type_enum.sql dropped in favor of bare upper/lower weeks earlier.
// Home is the first screen to actually render a label derived from this
// map, which is what surfaced the drift.
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
