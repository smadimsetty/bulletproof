// Segmented week/month/6mo/year control for the Trends screen, visually
// mirroring FeltRatingPicker's stepped-button row. Tapping a range calls
// onSelect immediately -- same autosave-on-tap shape as every other
// single-tap control across this app.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../lib/theme';
import type { TimeRange } from '../lib/trendsRange';

export interface TimeRangeSelectorProps {
  readonly value: TimeRange;
  readonly onSelect: (range: TimeRange) => void;
}

const RANGES: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '6mo', label: '6mo' },
  { value: 'year', label: 'Year' },
];

export default function TimeRangeSelector({ value, onSelect }: TimeRangeSelectorProps) {
  return (
    <View style={styles.row}>
      {RANGES.map((range) => {
        const active = value === range.value;
        return (
          <Pressable
            key={range.value}
            style={[styles.button, active && styles.buttonActive]}
            onPress={() => onSelect(range.value)}
            accessibilityLabel={`Show ${range.label} of trends`}
          >
            <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{range.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.xs },
  button: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  buttonActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  buttonText: { fontSize: 13, fontWeight: '600' as const, color: COLORS.ink },
  buttonTextActive: { color: COLORS.card },
});
