// apps/mobile/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Deliberately a small
// static lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement -- this is the screen's headline
// label, not the rationale sentence. See design spec Decision 3.
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

export function labelForSessionType(type: SessionType): string {
  return SESSION_TYPE_LABELS[type];
}
