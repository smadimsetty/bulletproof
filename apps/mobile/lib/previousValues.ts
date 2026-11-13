//
// Planned set rows for a newly-added exercise and their prefilled values
// from the most recent saved workout containing the same exercise (spec
// section 4, "Planned sets"). Pure.
import { EMPTY_SET_VALUES, type SetKind, type SetValues, type Side } from './setFields';
import { formatSetValue } from './setFormatting';
import type { WeightUnit } from './units';

export interface PlannedRow {
  readonly setNumber: number;
  readonly side: Side;
}

export interface PreviousSet extends SetValues {
  readonly setNumber: number;
  readonly side: Side;
}

/** The side logged first: the weaker (lead) side when the sprint flagged one, else left. */
export function firstSide(leadSide: Side | undefined): 'left' | 'right' {
  return leadSide === 'right' ? 'right' : 'left';
}

/** The incomplete other-side row of the same set number, when `set` is on the side logged first. */
export function otherSidePartner<T extends { setNumber: number; side: Side; completedAt: string | null }>(
  sets: readonly T[],
  set: T,
  leadSide: Side | undefined,
): T | null {
  const first = firstSide(leadSide);
  if (set.side !== first) return null;
  const second = first === 'left' ? 'right' : 'left';
  return sets.find((x) => x.setNumber === set.setNumber && x.side === second && !x.completedAt) ?? null;
}

/**
 * Planned rows: per set number, both sides (lead side first) for a one-sided
 * exercise, or a single row. `extraSideSet` adds one more set on the lead side
 * only (the weaker-side volume bias, spec 2026-11-12 §5.3 step 4).
 */
export function plannedRows(setCount: number, sided: boolean, leadSide?: Side, extraSideSet?: boolean): PlannedRow[] {
  const rows: PlannedRow[] = [];
  const first = firstSide(leadSide);
  const second = first === 'left' ? 'right' : 'left';
  for (let n = 1; n <= setCount; n++) {
    if (sided) {
      rows.push({ setNumber: n, side: first }, { setNumber: n, side: second });
    } else {
      rows.push({ setNumber: n, side: null });
    }
  }
  if (sided && extraSideSet && leadSide && setCount > 0) rows.push({ setNumber: setCount + 1, side: first });
  return rows;
}

const DEFAULT_HOLD_SECONDS = 30;

/** First "<number> <seconds|minutes unit>" in free text; null if none. */
export function parseTargetSeconds(text: string | null): number | null {
  if (!text) return null;
  const match = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return Math.round(unit.startsWith('m') ? value * 60 : value);
}

export function previousMatch(row: PlannedRow, previous: readonly PreviousSet[]): PreviousSet | null {
  const exact = previous.find((p) => p.setNumber === row.setNumber && p.side === row.side);
  if (exact) return exact;
  const sameSide = previous.filter((p) => p.side === row.side);
  if (sameSide.length === 0) return null;
  return sameSide.reduce((best, p) => (p.setNumber > best.setNumber ? p : best));
}

export function prefillValues(
  row: PlannedRow,
  previous: readonly PreviousSet[],
  kind: SetKind,
  targetText: string | null
): SetValues {
  const match = previousMatch(row, previous);
  if (match) {
    return {
      reps: match.reps,
      weightKg: match.weightKg,
      durationS: match.durationS,
      romValue: match.romValue,
      romUnit: match.romUnit,
    };
  }
  if (kind === 'hold') {
    return { ...EMPTY_SET_VALUES, durationS: parseTargetSeconds(targetText) ?? DEFAULT_HOLD_SECONDS };
  }
  return EMPTY_SET_VALUES;
}

/** The muted "prev: …" hint for a logger row; null when there is no history. */
export function previousHint(
  row: PlannedRow,
  previous: readonly PreviousSet[],
  kind: SetKind,
  unit: WeightUnit
): string | null {
  const match = previousMatch(row, previous);
  if (!match) return null;
  return `prev: ${formatSetValue({ ...match, setType: 'working' }, kind, unit)}`;
}
