// apps/mobile/components/progress/RecapEntryCard.tsx
//
// Entry points to the monthly recap: last month, and this month so far.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import { monthName } from '../../lib/stats/format';

export default function RecapEntryCard({
  now,
  onOpen,
}: {
  now: Date;
  onOpen: (year: number, month0: number) => void;
}) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rows = [
    { label: `${monthName(prev.getFullYear(), prev.getMonth())} recap`, year: prev.getFullYear(), month0: prev.getMonth() },
    { label: `${monthName(now.getFullYear(), now.getMonth())} so far`, year: now.getFullYear(), month0: now.getMonth() },
  ];
  return (
    <View style={sharedStyles.card}>
      <Text style={TYPE.sectionTitle}>Monthly recap</Text>
      {rows.map((r) => (
        <Pressable key={r.label} style={styles.row} onPress={() => onOpen(r.year, r.month0)}>
          <Text style={TYPE.body}>{r.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
