// apps/mobile/components/progress/MonthCalendar.tsx
//
// Monday-first month grid (visual spec 4.9). Workout day = accent circle; a
// sprint-day workout adds an outer accent ring; today is bold with a dot.
// Chevrons or a horizontal swipe page months, never past the current one.
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInLeft, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { monthGrid } from '../../lib/stats/consistency';
import { monthName } from '../../lib/stats/format';
import { Card, IconButton, ListRow, Sheet } from '../ui';

const HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function MonthCalendar({
  workouts,
  now,
}: {
  workouts: readonly { id: string; title?: string; endedAt: string; isSprint: boolean }[];
  now: Date;
}) {
  const router = useRouter();
  const [dayPick, setDayPick] = useState<string[] | null>(null);
  const openDay = (ids: string[]) => {
    if (ids.length === 1) router.push(`/workout-summary/${ids[0]}`);
    else if (ids.length > 1) setDayPick(ids);
  };
  const reduced = useReducedMotion();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const [direction, setDirection] = useState<1 | -1>(1);
  const isCurrent = cursor.year === now.getFullYear() && cursor.month0 === now.getMonth();
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month0, workouts, now), [cursor, workouts, now]);
  const isCurrentRef = useRef(isCurrent);
  isCurrentRef.current = isCurrent;

  function shift(delta: number) {
    if (delta > 0 && isCurrentRef.current) return;
    haptics.select();
    setDirection(delta > 0 ? 1 : -1);
    setCursor((c) => {
      const d = new Date(c.year, c.month0 + delta, 1);
      // Never page past the current month, whichever input (chevron or swipe) asked.
      if (d.getFullYear() * 12 + d.getMonth() > now.getFullYear() * 12 + now.getMonth()) return c;
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }

  const shiftRef = useRef(shift);
  shiftRef.current = shift;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx > 60) shiftRef.current(-1);
          else if (g.dx < -60) shiftRef.current(1);
        },
      }),
    []
  );

  const entering = reduced
    ? FadeIn.duration(150)
    : (direction > 0 ? FadeInRight : FadeInLeft).duration(200);

  return (
    <Card>
      <View style={styles.header}>
        <IconButton icon="chevron-back" size="sm" accessibilityLabel="Previous month" onPress={() => shift(-1)} />
        <Text style={TYPE.title3}>
          {monthName(cursor.year, cursor.month0)} {cursor.year}
        </Text>
        <IconButton icon="chevron-forward" size="sm" accessibilityLabel="Next month" disabled={isCurrent} onPress={() => shift(1)} />
      </View>
      <View {...pan.panHandlers}>
        <View style={styles.row}>
          {HEADERS.map((h, i) => (
            <Text key={i} style={[TYPE.caption, styles.cell, styles.head]}>
              {h}
            </Text>
          ))}
        </View>
        <Animated.View key={`${cursor.year}-${cursor.month0}`} entering={entering} style={styles.grid}>
          {grid.map((week, wi) => (
            <View key={wi} style={styles.row}>
              {week.map((day) => {
                const worked = day.count > 0;
                return (
                  <Pressable
                    key={day.date}
                    style={styles.cell}
                    disabled={!worked}
                    onPress={() => openDay(day.workoutIds)}
                    accessibilityRole={worked ? "button" : undefined}
                    accessibilityLabel={worked ? `${day.date}, ${day.count} workout${day.count === 1 ? "" : "s"}` : undefined}
                  >
                    <View style={[styles.ring, worked && day.hasSprint ? styles.sprintRing : null]}>
                      <View style={[styles.bubble, worked ? styles.filled : null]}>
                        <Text
                          style={[
                            TYPE.callout,
                            styles.dayText,
                            !day.inMonth && { color: COLORS.textDisabled },
                            day.isToday && styles.today,
                            worked && { color: COLORS.onAccent },
                          ]}
                        >
                          {Number(day.date.slice(8))}
                        </Text>
                      </View>
                    </View>
                    {day.isToday ? <View style={styles.todayDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendFilled} />
          <Text style={TYPE.caption}>Workout</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendRing} />
          <Text style={TYPE.caption}>Sprint day</Text>
        </View>
      </View>
      <Sheet visible={dayPick !== null} onClose={() => setDayPick(null)} title="Workouts">
        {(dayPick ?? []).map((id) => (
          <ListRow
            key={id}
            title={workouts.find((w) => w.id === id)?.title || "Workout"}
            onPress={() => {
              setDayPick(null);
              router.push(`/workout-summary/${id}`);
            }}
          />
        ))}
      </Sheet>
    </Card>
  );
}

// TODO(stage4): spec also wants a 1.5px accent outline for a sprint day with no workout; the
// calendar is only fed finished workouts, so that signal does not exist here. Left as-is.
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { gap: 0 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  head: { textAlign: 'center', height: 24 },
  ring: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sprintRing: { borderWidth: 2, borderColor: COLORS.accent },
  bubble: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: COLORS.accent },
  dayText: { color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
  today: { fontWeight: '700' },
  todayDot: { position: 'absolute', bottom: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.accent },
  legend: { flexDirection: 'row', gap: SPACING.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  legendFilled: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.accent },
  legendRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.accent },
});
