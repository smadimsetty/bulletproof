// apps/mobile/lib/swapOptions.ts
//
// Fetches the option list for the Home screen's "Swap activity" picker
// shell. This module has no swap-execution function -- there is no
// real backend for it. build_program_for_activity was explicitly deferred
// out of the engine v2 phase (docs/superpowers/specs/2026-06-24-engine-v2-
// design.md Non-goals / Decision 12), so this picker only ever displays
// options; index.tsx's SwapActivitySheet shows a "not available yet"
// message on selection instead of calling anything. See design spec
// Decision 8.
import { supabase } from './supabase';

export interface SwapOption {
  readonly id: string;
  readonly label: string;
}

export interface SwapOptionGroup {
  readonly category: 'strength' | 'cardio' | 'recovery';
  readonly label: string;
  readonly options: readonly SwapOption[];
}

const CATEGORY_LABELS: Record<SwapOptionGroup['category'], string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  recovery: 'Recovery',
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function fetchSwapOptions(): Promise<SwapOptionGroup[]> {
  const [profileRes, splitsRes, activitiesRes] = await Promise.all([
    supabase.from('user_profile').select('preferred_split').single(),
    supabase.from('split_taxonomy').select('id, label, day_labels'),
    supabase.from('activity_taxonomy').select('id, label, category'),
  ]);

  const firstError = profileRes.error ?? splitsRes.error ?? activitiesRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const preferredSplitId = (profileRes.data as { preferred_split: string } | null)?.preferred_split;
  const splits = (splitsRes.data ?? []) as { id: string; label: string; day_labels: string[] }[];
  const activities = (activitiesRes.data ?? []) as { id: string; label: string; category: string }[];

  const preferredSplit = splits.find((s) => s.id === preferredSplitId);
  const strengthOptions: SwapOption[] = (preferredSplit?.day_labels ?? []).map((dayLabel) => ({
    id: dayLabel,
    label: titleCase(dayLabel),
  }));

  const cardioOptions: SwapOption[] = activities
    .filter((a) => a.category === 'cardio')
    .map((a) => ({ id: a.id, label: a.label }));

  const recoveryOptions: SwapOption[] = activities
    .filter((a) => a.category === 'recovery')
    .map((a) => ({ id: a.id, label: a.label }));

  return [
    { category: 'strength', label: CATEGORY_LABELS.strength, options: strengthOptions },
    { category: 'cardio', label: CATEGORY_LABELS.cardio, options: cardioOptions },
    { category: 'recovery', label: CATEGORY_LABELS.recovery, options: recoveryOptions },
  ];
}
