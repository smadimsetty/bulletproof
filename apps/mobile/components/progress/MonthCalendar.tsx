// apps/mobile/components/progress/MonthCalendar.tsx
//
// Monday-first month grid. Filled dot = at least one finished workout that
// local day; outlined ring = a sprint-day workout; bold number = today.
// Arrows page months, never past the current one.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import { monthGrid } from '../../lib/stats/consistency';
import { monthName } from '../../lib/stats/format';

const HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function MonthCalendar({
  workouts,
  now,
}: {
  workouts: readonly { endedAt: string; isSprint: boolean }[];
  now: Date;
}) {
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const isCurrent = cursor.year === now.getFullYear() && cursor.month0 === now.getMonth();
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month0, workouts, now), [cursor, workouts, now]);

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month0 + delta, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }

  return (
    <View style={sharedStyles.card}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={COLORS.ink} />
        </Pressable>
        <Text style={TYPE.sectionTitle}>
          {monthName(cursor.year, cursor.month0)} {cursor.year}
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} disabled={isCurrent} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={isCurrent ? COLORS.border : COLORS.ink} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {HEADERS.map((h, i) => (
          <Text key={i} style={[styles.cell, styles.head]}>
            {h}
          </Text>
        ))}
      </View>
      {grid.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((day) => (
            <View key={day.date} style={styles.cell}>
              <View
                style={[
                  styles.dayBubble,
                  day.count > 0 && styles.filled,
                  day.hasSprint && styles.sprintRing,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !day.inMonth && styles.outside,
                    day.isToday && styles.today,
                    day.count > 0 && styles.onFilled,
                  ]}
                >
                  {Number(day.date.slice(8))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
      <Text style={sharedStyles.helperText}>Filled = workout · ring = sprint day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  head: { ...TYPE.helper, textAlign: 'center' },
  dayBubble: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: COLORS.accent },
  sprintRing: { borderWidth: 2, borderColor: COLORS.ink },
  dayText: { fontSize: 13, color: COLORS.ink },
  outside: { color: COLORS.border },
  today: { fontWeight: '800', textDecorationLine: 'underline' },
  onFilled: { color: COLORS.card },
});
