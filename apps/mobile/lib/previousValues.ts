//
// Planned set rows for a newly-added exercise and their prefilled values
// from the most recent saved workout containing the same exercise (spec
// section 4, "Planned sets"). Pure.
import { EMPTY_SET_VALUES, type SetKind, type SetValues, type Side } from './setFields';

export interface PlannedRow {
  readonly setNumber: number;
  readonly side: Side;
}

export interface PreviousSet extends SetValues {
  readonly setNumber: number;
  readonly side: Side;
}

export function plannedRows(setCount: number, sided: boolean): PlannedRow[] {
  const rows: PlannedRow[] = [];
  for (let n = 1; n <= setCount; n++) {
    if (sided) {
      rows.push({ setNumber: n, side: 'left' }, { setNumber: n, side: 'right' });
    } else {
      rows.push({ setNumber: n, side: null });
    }
  }
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
