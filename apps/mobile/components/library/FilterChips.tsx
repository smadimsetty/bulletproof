// apps/mobile/components/library/FilterChips.tsx
//
// One horizontally scrolling row of single-select chips; tapping the active
// chip clears it. Shared by the library screen and the exercise picker.
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles } from '../../lib/theme';

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
    <FlatList
      horizontal
      data={options}
      keyExtractor={(o) => o.value}
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => {
        const active = item.value === value;
        return (
          <Pressable onPress={() => onChange(active ? null : item.value)} style={[sharedStyles.chip, active && styles.chipActive]}>
            <Text style={[sharedStyles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  chipActive: { backgroundColor: COLORS.accent },
  chipTextActive: { color: COLORS.card },
});
