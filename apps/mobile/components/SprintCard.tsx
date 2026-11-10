// apps/mobile/components/SprintCard.tsx
//
// Workout-tab card summarising the in-flight pain-point sprint (visual spec
// 4.3). Presentation only: the same five states as before.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import type { Sprint, SprintDay } from '../lib/sprintLifecycle';
import type { ActiveWorkoutSummary } from '../lib/workouts';
import { Button, Card, Chip } from './ui';

const SPRINT_DAYS = 14;

function Segment({ state }: { state: 'done' | 'today' | 'future' }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(state === 'today' ? 0.4 : 1);
  useEffect(() => {
    if (state !== 'today' || reduced) {
      opacity.value = state === 'today' ? 0.7 : 1;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [state, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[styles.segment, { backgroundColor: state === 'future' ? COLORS.elevated : COLORS.accent }, style]}
    />
  );
}

function SegmentBar({ dayNumber, todayDone }: { dayNumber: number; todayDone: boolean }) {
  return (
    <View style={styles.segments}>
      {Array.from({ length: SPRINT_DAYS }, (_, i) => {
        const day = i + 1;
        const state = day < dayNumber || (day === dayNumber && todayDone) ? 'done' : day === dayNumber ? 'today' : 'future';
        return <Segment key={day} state={state} />;
      })}
    </View>
  );
}

export default function SprintCard({
  sprint,
  painPointName,
  today,
  activeWorkout,
  starting,
  onStartRoutine,
  onOpenSprint,
  onChangeFocus,
}: {
  sprint: Sprint | null;
  painPointName: string | null;
  today: SprintDay | null;
  activeWorkout: ActiveWorkoutSummary | null;
  starting: boolean;
  onStartRoutine: () => void;
  onOpenSprint: () => void;
  /** Shown on an active sprint's day card; opens the change-focus flow. */
  onChangeFocus?: () => void;
}) {
  const name = painPointName ?? 'Sprint';

  if (!sprint) {
    return (
      <Card>
        <View style={styles.iconCircle}>
          <Ionicons name="flash-outline" size={20} color={COLORS.accent} />
        </View>
        <Text style={TYPE.title3}>Pick a pain point</Text>
        <Text style={TYPE.callout}>14 days of short daily routines, with a before/after check.</Text>
        <Button title="Start a sprint" onPress={onOpenSprint} />
      </Card>
    );
  }

  if (sprint.status === 'pending_baseline' || sprint.status === 'pending_reassessment') {
    const baseline = sprint.status === 'pending_baseline';
    return (
      <Card>
        <Text style={TYPE.overline}>{`${name} sprint`}</Text>
        <Chip label={baseline ? 'Baseline due' : 'Assessment due'} tone="warning" icon="time-outline" />
        <Button title={baseline ? 'Take baseline' : 'Take assessment'} size="lg" onPress={onOpenSprint} />
      </Card>
    );
  }

  if (sprint.status === 'active' && today && !today.completedAt) {
    const resume = activeWorkout?.sprintDayId === today.id;
    return (
      <Card variant="accent">
        <View style={styles.headRow}>
          <Text style={[TYPE.overline, styles.flex]} numberOfLines={1}>{`${name} sprint`}</Text>
          <Text style={TYPE.stat}>
            {`Day ${today.dayNumber}`}
            <Text style={styles.of}>{` / ${SPRINT_DAYS}`}</Text>
          </Text>
        </View>
        <SegmentBar dayNumber={today.dayNumber} todayDone={false} />
        <Text style={TYPE.callout}>{`Today · ${today.exercises.length} exercises`}</Text>
        <Button
          title={resume ? "Resume today's routine" : "Start today's routine"}
          icon="play"
          iconPosition="right"
          size="lg"
          loading={starting}
          onPress={onStartRoutine}
        />
        {onChangeFocus ? (
          <Button title="Change today's focus" variant="secondary" size="sm" onPress={onChangeFocus} style={styles.alignStart} />
        ) : null}
        <Button title="View sprint" variant="ghost" size="sm" onPress={onOpenSprint} style={styles.alignStart} />
      </Card>
    );
  }

  if (sprint.status === 'active' && today?.completedAt) {
    return (
      <Card>
        <View style={styles.headRow}>
          <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
          <Text style={[TYPE.title3, styles.flex]}>{`Day ${today.dayNumber} done — back tomorrow`}</Text>
        </View>
        <SegmentBar dayNumber={today.dayNumber} todayDone />
        <Button title="View sprint" variant="secondary" onPress={onOpenSprint} />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={TYPE.overline}>{`${name} sprint`}</Text>
      <Text style={TYPE.callout}>No routine scheduled today</Text>
      <Button title="View sprint" variant="secondary" onPress={onOpenSprint} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  of: { ...TYPE.callout, color: COLORS.textTertiary },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 6, borderRadius: RADII.pill },
  alignStart: { alignSelf: 'flex-start' },
});
