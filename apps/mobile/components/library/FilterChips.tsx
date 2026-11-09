// apps/mobile/components/library/FilterChips.tsx
//
// One horizontally scrolling row of single-select chips; tapping the active
// chip clears it. Shared by the routine editor's folder picker (the library and
// the exercise picker use FilterChip directly).
import { FilterChip, FilterChipRow } from '../ui';

export interface ChipOption {
  label: string;
  value: string;
}

export interface FilterChipsProps {
  options: readonly ChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function FilterChips({ options, value, onChange }: FilterChipsProps) {
  if (options.length === 0) return null;
  return (
    <FilterChipRow>
      {options.map((o) => (
        <FilterChip key={o.value} label={o.label} selected={o.value === value} onToggle={() => onChange(o.value === value ? null : o.value)} />
      ))}
    </FilterChipRow>
  );
}
