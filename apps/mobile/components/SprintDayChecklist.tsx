// apps/mobile/components/SprintDayChecklist.tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import type { SprintDay, SprintDayExercise } from '../lib/sprintLifecycle';

export default function SprintDayChecklist({
  day,
  onToggleExercise,
  onOpenSwap,
  onCompleteDay,
  onAbandon,
  completingDay,
}: {
  day: SprintDay;
  onToggleExercise: (exercise: SprintDayExercise) => void;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onCompleteDay: () => void;
  onAbandon: () => void;
  completingDay: boolean;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <View style={styles.headerRow}>
        <Text style={TYPE.screenTitle}>Day {day.dayNumber} of 14</Text>
        <Pressable onPress={onAbandon}>
          <Text style={styles.link}>Switch pain point</Text>
        </Pressable>
      </View>
      {day.exercises.map((exercise) => (
        <View key={exercise.id} style={sharedStyles.card}>
          <Pressable style={styles.checkRow} onPress={() => onToggleExercise(exercise)}>
            <Text style={TYPE.body}>
              {exercise.completedAt ? '☑ ' : '☐ '}
              {exercise.exerciseName}
            </Text>
          </Pressable>
          {(exercise.prescribedSets || exercise.prescribedRepsOrDuration) && (
            <Text style={sharedStyles.helperText}>
              {exercise.prescribedSets ? `${exercise.prescribedSets} x ` : ''}
              {exercise.prescribedRepsOrDuration ?? ''}
            </Text>
          )}
          <Pressable onPress={() => onOpenSwap(exercise)}>
            <Text style={styles.link}>Swap</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={sharedStyles.primaryButton} disabled={completingDay} onPress={onCompleteDay}>
        <Text style={sharedStyles.primaryButtonText}>{completingDay ? 'Saving…' : 'Complete Day'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
  checkRow: { paddingVertical: SPACING.xs },
});
