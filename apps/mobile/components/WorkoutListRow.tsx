// apps/mobile/components/WorkoutListRow.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { durationLabel } from '../lib/historyGrouping';
import type { WorkoutListItem } from '../lib/workouts';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WorkoutListRow({ item, onPress }: { item: WorkoutListItem; onPress: () => void }) {
  return (
    <Pressable style={sharedStyles.card} onPress={onPress}>
      <View style={styles.titleRow}>
        <Text style={[TYPE.sectionTitle, styles.title]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.source === 'sprint' && (
          <View style={sharedStyles.chip}>
            <Text style={styles.tag}>Sprint</Text>
          </View>
        )}
      </View>
      <Text style={sharedStyles.helperText}>
        {dateLabel(item.startedAt)} · {durationLabel(item.startedAt, item.endedAt)}
      </Text>
      <Text style={TYPE.body}>
        {item.exerciseCount} {item.exerciseCount === 1 ? 'exercise' : 'exercises'} · {item.setCount}{' '}
        {item.setCount === 1 ? 'set' : 'sets'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { flex: 1 },
  tag: { ...TYPE.helper, color: COLORS.accent, fontWeight: '600' },
});
