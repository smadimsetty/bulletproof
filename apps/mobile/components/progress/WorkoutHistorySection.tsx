// apps/mobile/components/progress/WorkoutHistorySection.tsx
//
// Past workouts inside the Progress tab (History and Progress merged, 2026-11-13).
// A collapsed card with this-week / this-month / total counts; opened, it lists the
// workouts grouped by month, each month its own drop-down (the newest starts open).
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import type { WorkoutListItem } from '../../lib/workouts';
import { countThisWeekAndMonth, groupByMonth } from '../../lib/historyGrouping';
import WorkoutListRow from '../WorkoutListRow';
import { Button, Card, Disclosure, EmptyState, SectionHeader } from '../ui';

export default function WorkoutHistorySection({
  items,
  total,
  hasMore,
  loadingMore,
  now,
  onLoadMore,
  onOpenWorkout,
  onStartWorkout,
}: {
  items: readonly WorkoutListItem[];
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  now: Date;
  onLoadMore: () => void;
  onOpenWorkout: (id: string) => void;
  onStartWorkout: () => void;
}) {
  const { week, month } = countThisWeekAndMonth(items, now);
  const months = groupByMonth(items);
  const shownTotal = Math.max(total ?? 0, items.length);

  return (
    <View style={styles.section}>
      <SectionHeader title="Workouts" inset={SPACING.xs} />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="time-outline"
            title="No workouts yet"
            body="Finish a workout and it'll land here."
            action={{ label: 'Start a workout', onPress: onStartWorkout }}
          />
        </Card>
      ) : (
        <Card>
          <Disclosure
            accessibilityLabel="Past workouts"
            bodyStyle={styles.body}
            header={
              <View style={styles.counts}>
                {[
                  ['This week', week],
                  ['This month', month],
                  ['Total', shownTotal],
                ].map(([label, n]) => (
                  <View key={label as string} style={styles.count}>
                    <Text style={TYPE.stat}>{n}</Text>
                    <Text style={TYPE.caption}>{label}</Text>
                  </View>
                ))}
              </View>
            }
          >
            {months.map((m, i) => (
              <Disclosure
                key={m.label}
                defaultOpen={i === 0}
                accessibilityLabel={`${m.label} workouts`}
                style={styles.month}
                bodyStyle={styles.monthBody}
                header={
                  <Text style={TYPE.overline}>{`${m.label} · ${m.items.length}`}</Text>
                }
              >
                {m.items.map((item) => (
                  <WorkoutListRow key={item.id} item={item} onPress={() => onOpenWorkout(item.id)} />
                ))}
              </Disclosure>
            ))}
            {loadingMore ? (
              <ActivityIndicator color={COLORS.accent} />
            ) : hasMore ? (
              <Button title="Show older workouts" variant="ghost" onPress={onLoadMore} style={styles.more} />
            ) : null}
          </Disclosure>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  body: { gap: SPACING.sm, marginTop: SPACING.lg },
  counts: { flexDirection: 'row', gap: SPACING.lg },
  count: { flex: 1, gap: 2 },
  month: { paddingVertical: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.divider },
  monthBody: { gap: SPACING.xs, marginTop: SPACING.sm },
  more: { alignSelf: 'center' },
});
