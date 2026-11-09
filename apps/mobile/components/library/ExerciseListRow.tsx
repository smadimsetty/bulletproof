// apps/mobile/components/library/ExerciseListRow.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import type { LibraryExercise } from '../../lib/library';

export const TYPE_LABELS: Record<string, string> = {
  mobility_stretch: 'Stretch/hold',
  balance: 'Balance',
  strength: 'Strength',
  plyometric: 'Plyo',
  cardio: 'Cardio',
};

export function typeLabel(type: string | null): string {
  return (type && TYPE_LABELS[type]) || '';
}

export default function ExerciseListRow({ exercise, onPress }: { exercise: LibraryExercise; onPress: () => void }) {
  const sub = [typeLabel(exercise.exerciseType), exercise.bodyParts.join(', ')].filter(Boolean).join(' · ');
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.text}>
        <Text style={TYPE.body}>{exercise.name}</Text>
        {sub ? <Text style={sharedStyles.helperText}>{sub}</Text> : null}
      </View>
      {exercise.isMine ? (
        <View style={sharedStyles.chip}>
          <Text style={sharedStyles.chipText}>Mine</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  text: { flex: 1, gap: 2 },
});
