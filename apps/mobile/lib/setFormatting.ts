// Human-readable set lines for the workout detail screen (spec section 6).
import { formatWeightForDisplay, type WeightUnit } from './units';
import type { SetKind, SetValues, Side } from './setFields';

export interface FormattableSet extends SetValues {
  readonly setNumber: number;
  readonly side: Side;
  readonly setType: 'warmup' | 'working';
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

function formatRom(set: SetValues): string {
  if (set.romValue == null) return '';
  const unit = set.romUnit ?? 'cm';
  return unit === 'deg' ? ` · ${set.romValue}°` : ` · ${set.romValue} ${unit}`;
}

function formatCore(set: SetValues, kind: SetKind, unit: WeightUnit): string {
  switch (kind) {
    case 'weight_reps':
      return set.weightKg != null ? `${formatWeightForDisplay(set.weightKg, unit)} ${unit} × ${set.reps ?? 0}` : `× ${set.reps ?? 0}`;
    case 'reps':
      return `× ${set.reps ?? 0}`;
    case 'hold':
    case 'duration':
      return formatSeconds(set.durationS ?? 0);
  }
}

export function formatSetValue(set: FormattableSet, kind: SetKind, unit: WeightUnit): string {
  const prefix = set.setType === 'warmup' ? 'W ' : '';
  return `${prefix}${formatCore(set, kind, unit)}${formatRom(set)}`;
}

export function formatSetLines(sets: readonly FormattableSet[], kind: SetKind, unit: WeightUnit): string[] {
  const numbers = Array.from(new Set(sets.map((x) => x.setNumber))).sort((a, b) => a - b);
  return numbers.map((n) => {
    const group = sets.filter((x) => x.setNumber === n);
    const left = group.find((x) => x.side === 'left');
    const right = group.find((x) => x.side === 'right');
    if (left || right) {
      return [left && `L ${formatSetValue(left, kind, unit)}`, right && `R ${formatSetValue(right, kind, unit)}`]
        .filter(Boolean)
        .join(' · ');
    }
    return formatSetValue(group[0], kind, unit);
  });
}
