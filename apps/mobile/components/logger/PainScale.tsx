// apps/mobile/components/logger/PainScale.tsx
//
// A 0-10 pain picker for the finish sheet: eleven equal cells in one row,
// nothing preselected (spec 2026-11-12 §8a.3, "0" is one tap). Tapping the
// selected number clears it.
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, TYPE } from '../../lib/theme';
import { PressableScale } from '../ui/PressableScale';

export interface PainScaleProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

const VALUES = Array.from({ length: 11 }, (_, i) => i);

export default function PainScale({ value, onChange }: PainScaleProps) {
  return (
    <View>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Pain from 0 to 10">
        {VALUES.map((n) => {
          const selected = value === n;
          return (
            <PressableScale
              key={n}
              haptic="select"
              accessibilityRole="radio"
              accessibilityLabel={`Pain ${n}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? null : n)}
              style={styles.hit}
            >
              <View style={[styles.cell, selected && styles.cellSelected]}>
                <Text style={[TYPE.callout, styles.label, { color: selected ? COLORS.accent : COLORS.textSecondary }]}>{n}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
      <View style={styles.ends}>
        <Text style={TYPE.caption}>No pain</Text>
        <Text style={TYPE.caption}>Worst</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  hit: { flex: 1, minHeight: 44, justifyContent: 'center' },
  cell: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.elevated,
  },
  cellSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accentTint },
  label: { fontWeight: '600' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
