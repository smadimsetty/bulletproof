import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DescriptionToggleButton, useToggle } from '../DescriptionToggle';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import type { WorkoutExerciseRow, WorkoutSetRow } from '../../lib/workouts';
import type { WeightUnit } from '../../lib/units';

export interface ExerciseCardProps {
  exercise: WorkoutExerciseRow;
  unit: WeightUnit;
  renderSet: (set: WorkoutSetRow) => ReactNode;
  onAddSet: () => void;
  onToggleRom: () => void;
  onRemove: () => void;
}

export default function ExerciseCard({ exercise, renderSet, onAddSet, onToggleRom, onRemove }: ExerciseCardProps) {
  const [descOpen, toggleDesc] = useToggle();
  function openMenu() {
    Alert.alert(exercise.exerciseName, undefined, [
      { text: exercise.measureRom ? 'Stop measuring ROM' : 'Measure ROM', onPress: onToggleRom },
      {
        text: 'Remove exercise',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Remove exercise?', 'Its sets will be deleted.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: onRemove },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={sharedStyles.card}>
      <View style={styles.header}>
        <Text style={[TYPE.sectionTitle, styles.title]}>{exercise.exerciseName}</Text>
        {!!exercise.description && <DescriptionToggleButton open={descOpen} onToggle={toggleDesc} />}
        <Pressable onPress={openMenu} hitSlop={10} accessibilityLabel="Exercise options">
          <Text style={styles.menu}>⋯</Text>
        </Pressable>
      </View>
      {descOpen && !!exercise.description ? <Text style={sharedStyles.helperText}>{exercise.description}</Text> : null}
      {exercise.targetText ? <Text style={sharedStyles.helperText}>Target: {exercise.targetText}</Text> : null}
      {exercise.sets.map(renderSet)}
      <Pressable onPress={onAddSet} hitSlop={6}>
        <Text style={styles.add}>+ Add set</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  title: { flex: 1 },
  menu: { fontSize: 22, color: COLORS.muted, paddingHorizontal: SPACING.xs },
  add: { ...TYPE.label, color: COLORS.accent, paddingVertical: SPACING.xs },
});
