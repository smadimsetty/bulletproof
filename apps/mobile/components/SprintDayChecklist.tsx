// apps/mobile/components/SprintDayChecklist.tsx
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { DescriptionToggleButton, useToggle } from './DescriptionToggle';
import { COLORS, sharedStyles, TYPE } from '../lib/theme';
import type { SprintDay, SprintDayExercise } from '../lib/sprintLifecycle';

export default function SprintDayChecklist({
  day,
  onOpenSwap,
  onOpenLastAssessment,
  onStartRoutine,
  onAbandon,
  starting,
  routineInProgress,
  dayComplete = false,
  refreshControl,
}: {
  day: SprintDay;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onOpenLastAssessment: () => void;
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
        <View style={styles.headerLinks}>
          <Pressable onPress={onOpenLastAssessment}>
            <Text style={styles.link}>Last assessment</Text>
          </Pressable>
          <Pressable onPress={onAbandon}>
            <Text style={styles.link}>Switch pain point</Text>
          </Pressable>
        </View>
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
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          dayComplete={dayComplete}
          routineInProgress={routineInProgress}
          onOpenSwap={onOpenSwap}
        />
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

// Own component so each exercise keeps its own description open/closed state.
function ExerciseRow({
  exercise,
  dayComplete,
  routineInProgress,
  onOpenSwap,
}: {
  exercise: SprintDayExercise;
  dayComplete: boolean;
  routineInProgress: boolean;
  onOpenSwap: (exercise: SprintDayExercise) => void;
}) {
  const [open, toggle] = useToggle();
  return (
    <View style={sharedStyles.card}>
      <View style={styles.titleRow}>
        <Text style={[TYPE.body, styles.titleText, dayComplete && styles.mutedText]}>
          {exercise.completedAt ? '✓ ' : ''}
          {exercise.exerciseName}
        </Text>
        {!!exercise.description && <DescriptionToggleButton open={open} onToggle={toggle} />}
      </View>
      {(exercise.prescribedSets || exercise.prescribedRepsOrDuration) && (
        <Text style={sharedStyles.helperText}>
          {exercise.prescribedSets ? `${exercise.prescribedSets} x ` : ''}
          {exercise.prescribedRepsOrDuration ?? ''}
        </Text>
      )}
      {open && !!exercise.description && <Text style={sharedStyles.helperText}>{exercise.description}</Text>}
      {/* Swapping an exercise that's already checked off would move its
          completed_at onto a different exercise -- falsely crediting the
          swap target and erasing the real one, which then pollutes the
          LRU picker's history. Simply don't offer it once it's done.
          Same while today's workout is in progress: the workout row
          still points at this sprint_day_exercise, so saving it would
          credit the swapped-in exercise instead. */}
      {!exercise.completedAt && !dayComplete && !routineInProgress && (
        <Pressable onPress={() => onOpenSwap(exercise)}>
          <Text style={styles.link}>Swap</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleText: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLinks: { alignItems: 'flex-end', gap: 4 },
  link: { color: COLORS.accent, fontWeight: '600' },
  mutedText: { color: COLORS.muted },
});
