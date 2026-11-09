// apps/mobile/lib/stats/format.ts
//
// Display helpers shared by the Progress tab, recap, exercise detail, PR
// toasts and the workout summary. Weight PRs are stored in kg and converted
// to the user's unit only here.
import { kgToDisplayUnit, type WeightUnit } from '../units';
import type { PrEvent, PrKind } from './prs';

export const PR_KIND_LABEL: Record<PrKind, string> = {
  longest_hold: 'Longest hold',
  best_rom: 'Best ROM',
  most_reps: 'Most reps',
  heaviest_weight: 'Heaviest',
};

/** `Nov 8` */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function monthName(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString('en-US', { month: 'long' });
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function formatPrValue(kind: PrKind, value: number, unit: string, weightUnit: WeightUnit, reps?: number): string {
  switch (kind) {
    case 'longest_hold': return `${trim(value)}s`;
    case 'most_reps': return `${trim(value)} reps`;
    case 'heaviest_weight': return `${trim(kgToDisplayUnit(value, weightUnit))} ${weightUnit}${reps != null && reps > 0 ? ` × ${reps}` : ''}`;
    case 'best_rom': return `${trim(value)} ${unit}`;
  }
}

export function sideSuffix(side: 'left' | 'right' | null): string {
  return side === 'left' ? ' (L)' : side === 'right' ? ' (R)' : '';
}

/** `Longest hold (L) · 75s` */
export function prHeadline(kind: PrKind, side: 'left' | 'right' | null, value: number, unit: string, weightUnit: WeightUnit, reps?: number): string {
  return `${PR_KIND_LABEL[kind]}${sideSuffix(side)} · ${formatPrValue(kind, value, unit, weightUnit, reps)}`;
}

/** `Ankle CARs · Longest hold (L) · 75s ↑ from 60s` */
export function describePrEvent(e: PrEvent, weightUnit: WeightUnit): string {
  // Weight tie-break (same weight, more reps): show reps on both sides.
  const tie = e.kind === 'heaviest_weight' && e.value === e.previous;
  const reps = tie ? e.reps : undefined;
  const prevReps = tie ? e.previousReps : undefined;
  return `${e.exerciseName} · ${prHeadline(e.kind, e.side, e.value, e.unit, weightUnit, reps)} ↑ from ${formatPrValue(e.kind, e.previous, e.unit, weightUnit, prevReps)}`;
}
