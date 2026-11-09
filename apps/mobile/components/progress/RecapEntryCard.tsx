// apps/mobile/components/progress/RecapEntryCard.tsx
//
// Entry points to the monthly recap: last month, and this month so far
// (visual spec 4.9 section 5) -- two side-by-side cards.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { monthName } from '../../lib/stats/format';
import { Card } from '../ui';

export default function RecapEntryCard({
  now,
  workouts,
  onOpen,
}: {
  now: Date;
  /** Finished workouts' end timestamps, for the "12 workouts" counts. */
  workouts: readonly { endedAt: string }[];
  onOpen: (year: number, month0: number) => void;
}) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const count = (year: number, month0: number) =>
    workouts.filter((w) => {
      const d = new Date(w.endedAt);
      return d.getFullYear() === year && d.getMonth() === month0;
    }).length;
  const cards = [
    { overline: monthName(prev.getFullYear(), prev.getMonth()), year: prev.getFullYear(), month0: prev.getMonth() },
    { overline: `${monthName(now.getFullYear(), now.getMonth())} so far`, year: now.getFullYear(), month0: now.getMonth() },
  ];
  return (
    <View style={styles.row}>
      {cards.map((c) => {
        const n = count(c.year, c.month0);
        return (
          <Card key={`${c.year}-${c.month0}`} style={styles.card} onPress={() => onOpen(c.year, c.month0)} accessibilityLabel={`${c.overline} recap`}>
            <Text style={TYPE.overline} numberOfLines={1}>
              {c.overline}
            </Text>
            <Text style={TYPE.title3}>Monthly recap</Text>
            <View style={styles.foot}>
              <Text style={[TYPE.footnote, styles.count]}>{`${n} ${n === 1 ? 'workout' : 'workouts'}`}</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.accent} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.md },
  card: { flex: 1, gap: SPACING.xs },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontVariant: ['tabular-nums'] },
});
