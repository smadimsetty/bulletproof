// apps/mobile/components/logger/ExerciseCard.tsx
//
// One exercise in the logger (visual spec 4.6): name (taps through to the
// exercise detail), Sprint badge, description eye toggle, a done check once
// every set is ticked, a menu ActionSheet, the set rows and "+ Add set".
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DescriptionBody, DescriptionToggleButton, useToggle } from '../DescriptionToggle';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import type { WorkoutExerciseRow, WorkoutSetRow } from '../../lib/workouts';
import type { WeightUnit } from '../../lib/units';
import { ActionSheet, Badge, Button, Card, ConfirmSheet, IconButton, PressableScale } from '../ui';

export interface ExerciseCardProps {
  exercise: WorkoutExerciseRow;
  unit: WeightUnit;
  renderSet: (set: WorkoutSetRow) => ReactNode;
  onAddSet: () => void;
  onToggleRom: () => void;
  onRemove: () => void;
  /** Column header row above the sets (SetColumnHeader). */
  columnHeader?: ReactNode;
}

export default function ExerciseCard({ exercise, renderSet, onAddSet, onToggleRom, onRemove, columnHeader }: ExerciseCardProps) {
  const router = useRouter();
  const [descOpen, toggleDesc] = useToggle();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removedRef = useRef(false);
  const allDone = exercise.sets.length > 0 && exercise.sets.every((s) => !!s.completedAt);

  return (
    <Card>
      <View style={styles.header}>
        <PressableScale
          style={styles.titleWrap}
          scaleTo={0.98}
          onPress={() => router.push(`/exercise/${exercise.exerciseId}`)}
          accessibilityLabel={`${exercise.exerciseName} details`}
        >
          <Text style={[TYPE.title3, styles.title]} numberOfLines={2}>
            {exercise.exerciseName}
          </Text>
        </PressableScale>
        {exercise.sprintDayExerciseId ? <Badge label="Sprint" tone="tint" /> : null}
        {allDone ? <Ionicons name="checkmark-circle" size={22} color={COLORS.success} /> : null}
        {!!exercise.description && <DescriptionToggleButton open={descOpen} onToggle={toggleDesc} />}
        <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="Exercise options" onPress={() => setMenuOpen(true)} />
      </View>
      {!!exercise.description && <DescriptionBody open={descOpen} text={exercise.description} />}
      {exercise.targetText ? <Text style={TYPE.footnote}>{`Target ${exercise.targetText}`}</Text> : null}
      {columnHeader ?? null}
      <View style={styles.sets}>{exercise.sets.map(renderSet)}</View>
      <Button title="Add set" icon="add" variant="ghost" size="sm" onPress={onAddSet} style={styles.addSet} />

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={exercise.exerciseName}
        actions={[
          { label: exercise.measureRom ? 'Stop measuring ROM' : 'Measure ROM', icon: 'resize-outline', onPress: onToggleRom },
          { label: 'Remove exercise', icon: 'trash-outline', destructive: true, onPress: () => setConfirmRemove(true) },
        ]}
      />
      <ConfirmSheet
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove exercise?"
        body="Its sets will be deleted."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (removedRef.current) return;
          removedRef.current = true;
          setConfirmRemove(false);
          onRemove();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  titleWrap: { flex: 1, minHeight: 36, justifyContent: 'center' },
  title: {},
  sets: { gap: SPACING.xs },
  addSet: { alignSelf: 'flex-start' },
});
