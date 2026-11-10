// apps/mobile/components/library/ExerciseListRow.tsx
//
// Library row (visual spec 4.12): name, "Stretch/hold · ankle, calf" subtitle and a
// person glyph for the user's own exercises. Built on ListRow.
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../lib/theme';
import { bodyPartLabel } from '../../lib/bodyParts';
import type { LibraryExercise } from '../../lib/library';
import { ListRow } from '../ui';

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
  const sub = [typeLabel(exercise.exerciseType), exercise.bodyParts.map(bodyPartLabel).join(', ')].filter(Boolean).join(' · ');
  return (
    <ListRow
      title={exercise.name}
      subtitle={sub || undefined}
      onPress={onPress}
      trailing={
        <View style={styles.trailing}>
          {exercise.isMine ? <Ionicons name="person-circle-outline" size={16} color={COLORS.textTertiary} accessibilityLabel="Mine" /> : null}
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});
