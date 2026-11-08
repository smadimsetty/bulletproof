// apps/mobile/components/SprintDayChecklist.tsx
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../lib/theme';
import type { SprintDay, SprintDayExercise } from '../lib/sprintLifecycle';

export default function SprintDayChecklist({
  day,
  onOpenSwap,
  onStartRoutine,
  onAbandon,
  starting,
  routineInProgress,
  dayComplete = false,
  refreshControl,
}: {
  day: SprintDay;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onStartRoutine: () => void;
  onAbandon: () => void;
  starting: boolean;
  routineInProgress: boolean;
  /** Today is already logged: show what was done, but stop accepting edits. */
  dayComplete?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
}) {
  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={refreshControl}
    >
      <View style={styles.headerRow}>
        <Text style={TYPE.screenTitle}>Day {day.dayNumber} of 14</Text>
        <Pressable onPress={onAbandon}>
          <Text style={styles.link}>Switch pain point</Text>
        </Pressable>
      </View>
      {dayComplete && (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>Day {day.dayNumber} logged ✓</Text>
          <Text style={sharedStyles.helperText}>
            {day.dayNumber === 14
              ? "That's the full 14 — your reassessment is up next."
              : 'Nothing more to do today. Tomorrow’s routine unlocks in the morning.'}
          </Text>
        </View>
      )}
      {day.exercises.map((exercise) => (
        <View key={exercise.id} style={sharedStyles.card}>
          <Text style={[TYPE.body, dayComplete && styles.mutedText]}>
            {exercise.completedAt ? '✓ ' : ''}
            {exercise.exerciseName}
          </Text>
          {(exercise.prescribedSets || exercise.prescribedRepsOrDuration) && (
            <Text style={sharedStyles.helperText}>
              {exercise.prescribedSets ? `${exercise.prescribedSets} x ` : ''}
              {exercise.prescribedRepsOrDuration ?? ''}
            </Text>
          )}
          {/* Swapping an exercise that's already checked off would move its
              completed_at onto a different exercise -- falsely crediting the
              swap target and erasing the real one, which then pollutes the
              LRU picker's history. Simply don't offer it once it's done. */}
          {!exercise.completedAt && !dayComplete && (
            <Pressable onPress={() => onOpenSwap(exercise)}>
              <Text style={styles.link}>Swap</Text>
            </Pressable>
          )}
        </View>
      ))}
      {!dayComplete && (
        <Pressable style={sharedStyles.primaryButton} disabled={starting} onPress={onStartRoutine}>
          <Text style={sharedStyles.primaryButtonText}>
            {starting ? 'Starting…' : routineInProgress ? "Resume today's routine" : "Start today's routine"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
  mutedText: { color: COLORS.muted },
});
