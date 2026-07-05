// apps/mobile/lib/swapOptions.ts
//
// Option list for the Home screen's "Swap activity" picker. Deliberately a
// static list of exactly the six session_type values engine/swap_activity.py
// (and program_builder/scoring underneath it) can actually build a program
// for -- earlier this pulled from user_profile.preferred_split/split_taxonomy/
// activity_taxonomy (Settings' broader "what activities do you do" lookup
// tables), but that surfaced options like "yoga"/"walking"/"tennis" and
// split day_labels like "push"/"pull"/"chest_back" that swap_activity.py's
// VALID_ACTIVITIES would reject outright -- a picker that offers choices
// the backend can't fulfill isn't a real fix. See CLAUDE.md's schema notes:
// session_type is a fixed six-value enum, not the open activity_taxonomy set.
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

function option(id: SessionType): SwapOption {
  return { id, label: SESSION_TYPE_LABELS[id] };
}

const GROUPS: readonly SwapOptionGroup[] = [
  { category: 'strength', label: 'Strength', options: [option('upper'), option('lower')] },
  { category: 'cardio', label: 'Cardio', options: [option('pickleball'), option('run')] },
  { category: 'recovery', label: 'Recovery', options: [option('mobility'), option('rest')] },
];

export async function fetchSwapOptions(): Promise<SwapOptionGroup[]> {
  return [...GROUPS];
}
