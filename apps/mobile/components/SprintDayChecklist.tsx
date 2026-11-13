// apps/mobile/components/SprintDayChecklist.tsx
//
// Active sprint day (visual spec 4.5c): hero with the day number and a
// progress ring, today's routine as numbered exercise cards (eye toggle +
// swap), a sticky Start / Resume footer, and a header menu for "Last
// assessment" and "Switch pain point". Logic is unchanged: every action is a prop.
// Adaptive engine (spec 2026-11-12 §5.5): the plan summary under the pain point,
// a "why today" line above the routine, each exercise's level and step, and the
// weaker side's extra set.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DescriptionBody, DescriptionToggleButton, useToggle } from './DescriptionToggle';
import { COLORS, NUMERAL_MAX_FONT_SCALE, SPACING, TYPE } from '../lib/theme';
import type { SprintDay, SprintDayExercise } from '../lib/sprintLifecycle';
import { fetchSprintDayWorkoutId } from '../lib/workouts';
import { ActionSheet, Button, Card, IconButton, PressableScale, ProgressRing, ScreenScroll, SectionHeader, StickyFooter } from './ui';

export default function SprintDayChecklist({
  day,
  painPointName,
  onOpenSwap,
  onOpenLastAssessment,
  onStartRoutine,
  onAbandon,
  starting,
  routineInProgress,
  dayComplete = false,
  refreshing = false,
  onRefresh,
  planSummary,
}: {
  day: SprintDay;
  painPointName?: string | null;
  /** The coach's summary, or the rules template while it hasn't arrived. */
  planSummary?: string | null;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onOpenLastAssessment: () => void;
  onStartRoutine: () => void;
  onAbandon: () => void;
  starting: boolean;
  routineInProgress: boolean;
  /** Today is already logged: show what was done, but stop accepting edits. */
  dayComplete?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [doneWorkoutId, setDoneWorkoutId] = useState<string | null>(null);
  useEffect(() => {
    if (!dayComplete) {
      setDoneWorkoutId(null);
      return;
    }
    let cancelled = false;
    fetchSprintDayWorkoutId(day.id)
      .then((id) => {
        if (!cancelled) setDoneWorkoutId(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dayComplete, day.id]);
  const daysLeft = Math.max(0, 14 - day.dayNumber);
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: `Day ${day.dayNumber} of 14`,
          headerRight: () => (
            <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="Sprint options" onPress={() => setMenuOpen(true)} />
          ),
        }}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={onRefresh}>
        <Card>
          <View style={styles.hero}>
            <View style={styles.heroText}>
              <View style={styles.heroNumberRow}>
                <Text style={styles.heroNumber} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
                  {day.dayNumber}
                </Text>
                <Text style={[TYPE.stat, { color: COLORS.textTertiary }]} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
                  /14
                </Text>
              </View>
              <Text style={TYPE.overline}>
                {`${painPointName ? `${painPointName} · ` : ''}${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
              </Text>
            </View>
            <ProgressRing progress={(dayComplete ? day.dayNumber : day.dayNumber - 1) / 14} size={72} stroke={8} label={<Text style={TYPE.stat}>{day.dayNumber}</Text>} />
          </View>
          {planSummary ? <Text style={[TYPE.callout, styles.summary]}>{planSummary}</Text> : null}
        </Card>
        {dayComplete && (
          <Card variant="outline" style={styles.doneCard}>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={[TYPE.title3, styles.flex]}>{`Day ${day.dayNumber} done. See you tomorrow.`}</Text>
            </View>
            {doneWorkoutId ? (
              <Button title="View workout" variant="secondary" onPress={() => router.push(`/workout-summary/${doneWorkoutId}`)} />
            ) : null}
            {day.dayNumber === 14 ? <Text style={TYPE.callout}>That's the full 14 — your reassessment is up next.</Text> : null}
          </Card>
        )}
        <SectionHeader title="Today's routine" inset={SPACING.xs} />
        {day.whyToday ? (
          <View style={styles.whyRow}>
            <Ionicons name="sparkles-outline" size={16} color={COLORS.accent} />
            <Text style={[TYPE.callout, styles.flex]}>{day.whyToday}</Text>
          </View>
        ) : null}
        {day.exercises.map((exercise, i) => (
          <ExerciseRow
            key={exercise.id}
            index={i + 1}
            exercise={exercise}
            dayComplete={dayComplete}
            routineInProgress={routineInProgress}
            onOpenSwap={onOpenSwap}
          />
        ))}
      </ScreenScroll>
      {!dayComplete && (
        <StickyFooter>
          <Button
            title={routineInProgress ? 'Resume routine' : "Start today's routine"}
            icon="play"
            size="lg"
            fullWidth
            loading={starting}
            onPress={onStartRoutine}
          />
        </StickyFooter>
      )}
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: 'Last assessment', icon: 'clipboard-outline', onPress: onOpenLastAssessment },
          { label: 'Switch pain point', icon: 'swap-horizontal-outline', destructive: true, onPress: onAbandon },
        ]}
      />
    </View>
  );
}

// Let the ActionSheet finish dismissing before the next Modal presents (iOS drops overlapping presentations).

// Own component so each exercise keeps its own description open/closed state.
function ExerciseRow({
  index,
  exercise,
  dayComplete,
  routineInProgress,
  onOpenSwap,
}: {
  index: number;
  exercise: SprintDayExercise;
  dayComplete: boolean;
  routineInProgress: boolean;
  onOpenSwap: (exercise: SprintDayExercise) => void;
}) {
  const router = useRouter();
  const [open, toggle] = useToggle();
  // Swapping an exercise that's already checked off would move its
  // completed_at onto a different exercise -- falsely crediting the
  // swap target and erasing the real one, which then pollutes the
  // LRU picker's history. Simply don't offer it once it's done.
  // Same while today's workout is in progress: the workout row
  // still points at this sprint_day_exercise, so saving it would
  // credit the swapped-in exercise instead.
  const canSwap = !exercise.completedAt && !dayComplete && !routineInProgress;
  return (
    <Card>
      <View style={styles.rowTop}>
        <View style={styles.numberCircle}>
          {exercise.completedAt ? (
            <Ionicons name="checkmark" size={16} color={COLORS.success} />
          ) : (
            <Text style={[TYPE.callout, styles.numberText]}>{index}</Text>
          )}
        </View>
        <View style={styles.flex}>
          <PressableScale
            scaleTo={0.98}
            onPress={() => router.push(`/exercise/${exercise.exerciseId}`)}
            accessibilityRole="link"
            accessibilityLabel={`${exercise.exerciseName} details`}
          >
            <Text style={[TYPE.bodyStrong, dayComplete ? { color: COLORS.textSecondary } : null]} numberOfLines={2}>
              {exercise.exerciseName}
            </Text>
          </PressableScale>
          {(exercise.prescribedSets || exercise.prescribedRepsOrDuration) && (
            <Text style={[TYPE.callout, styles.tabular]}>
              {exercise.prescribedSets ? `${exercise.prescribedSets} × ` : ''}
              {exercise.prescribedRepsOrDuration ?? ''}
            </Text>
          )}
          {exercise.level != null ? (
            <Text style={[TYPE.caption, styles.tabular]}>
              {`Level ${exercise.level}${exercise.step != null ? ` · step ${exercise.step}` : ''}`}
            </Text>
          ) : null}
          {exercise.extraSideSet && exercise.leadSide ? (
            <Text style={[TYPE.caption, styles.weaker]}>
              {`Weaker side: ${exercise.leadSide === 'left' ? 'Left' : 'Right'} · +1 set`}
            </Text>
          ) : null}
        </View>
        {!!exercise.description && <DescriptionToggleButton open={open} onToggle={toggle} />}
        {canSwap ? (
          <IconButton icon="swap-horizontal-outline" size="sm" accessibilityLabel={`Swap ${exercise.exerciseName}`} onPress={() => onOpenSwap(exercise)} />
        ) : null}
      </View>
      {!!exercise.description && <DescriptionBody open={open} text={exercise.description} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  heroText: { flex: 1, gap: SPACING.xs },
  heroNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs },
  heroNumber: { ...TYPE.display },
  doneCard: { borderColor: COLORS.success },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  numberCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.elevated, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tabular: { fontVariant: ['tabular-nums'] },
  summary: { marginTop: SPACING.md },
  whyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingHorizontal: SPACING.xs },
  weaker: { color: COLORS.accent },
});
