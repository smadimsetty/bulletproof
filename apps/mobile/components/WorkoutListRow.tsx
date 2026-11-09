// apps/mobile/components/WorkoutListRow.tsx
//
// History/recent row (visual spec 4.8): date block, title, summary line and a
// Sprint badge. Used by the Workout tab, History and the profile list.
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import { durationLabel } from '../lib/historyGrouping';
import type { WorkoutListItem } from '../lib/workouts';
import { Badge, PressableScale } from './ui';

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short' }).toUpperCase();
}

function dayLabel(iso: string): string {
  return String(new Date(iso).getDate()).padStart(2, '0');
}

export default function WorkoutListRow({ item, onPress }: { item: WorkoutListItem; onPress: () => void }) {
  const exercises = `${item.exerciseCount} ${item.exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  const sets = `${item.setCount} ${item.setCount === 1 ? 'set' : 'sets'}`;
  return (
    <PressableScale style={styles.row} scaleTo={0.98} onPress={onPress} accessibilityLabel={item.title}>
      <View style={styles.date}>
        <Text style={TYPE.caption}>{monthLabel(item.startedAt)}</Text>
        <Text style={styles.day}>{dayLabel(item.startedAt)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={TYPE.bodyStrong} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={TYPE.footnote} numberOfLines={1}>
          {`${durationLabel(item.startedAt, item.endedAt)} · ${exercises} · ${sets}`}
        </Text>
      </View>
      {item.source === 'sprint' ? <Badge label="Sprint" tone="tint" /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 68,
    paddingVertical: SPACING.sm,
  },
  date: {
    width: 44,
    height: 44,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, fontVariant: ['tabular-nums'], lineHeight: 20 },
  body: { flex: 1, gap: 2 },
});
