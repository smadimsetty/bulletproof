// apps/mobile/components/SprintCard.tsx
//
// Workout-tab card summarising the in-flight pain-point sprint (spec
// section 1, bullet 2).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, sharedStyles } from '../lib/theme';
import type { Sprint, SprintDay } from '../lib/sprintLifecycle';
import type { ActiveWorkoutSummary } from '../lib/workouts';

export default function SprintCard({
  sprint,
  painPointName,
  today,
  activeWorkout,
  starting,
  onStartRoutine,
  onOpenSprint,
}: {
  sprint: Sprint | null;
  painPointName: string | null;
  today: SprintDay | null;
  activeWorkout: ActiveWorkoutSummary | null;
  starting: boolean;
  onStartRoutine: () => void;
  onOpenSprint: () => void;
}) {
  const name = painPointName ?? 'Sprint';
  const viewLink = (
    <Pressable onPress={onOpenSprint}>
      <Text style={styles.link}>View sprint</Text>
    </Pressable>
  );

  if (!sprint) {
    return (
      <Card>
        <Text style={sharedStyles.sectionTitle}>Fix a pain point</Text>
        <Text style={sharedStyles.helperText}>Pick one pain point and run a 14-day routine.</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={onOpenSprint}>
          <Text style={sharedStyles.primaryButtonText}>Choose a pain point</Text>
        </Pressable>
      </Card>
    );
  }

  if (sprint.status === 'pending_baseline' || sprint.status === 'pending_reassessment') {
    const baseline = sprint.status === 'pending_baseline';
    return (
      <Card>
        <Text style={sharedStyles.sectionTitle}>{name}</Text>
        <Text style={sharedStyles.helperText}>{baseline ? 'Baseline assessment due' : 'Reassessment due'}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={onOpenSprint}>
          <Text style={sharedStyles.primaryButtonText}>{baseline ? 'Take baseline' : 'Reassess'}</Text>
        </Pressable>
      </Card>
    );
  }

  if (sprint.status === 'active' && today && !today.completedAt) {
    const resume = activeWorkout?.sprintDayId === today.id;
    return (
      <Card>
        <Text style={sharedStyles.sectionTitle}>{`${name} · Day ${today.dayNumber} of 14`}</Text>
        <Text style={sharedStyles.helperText}>{`${today.exercises.length} exercises`}</Text>
        <Pressable style={sharedStyles.primaryButton} disabled={starting} onPress={onStartRoutine}>
          <Text style={sharedStyles.primaryButtonText}>
            {starting ? 'Starting…' : resume ? "Resume today's routine" : "Start today's routine"}
          </Text>
        </Pressable>
        {viewLink}
      </Card>
    );
  }

  if (sprint.status === 'active' && today?.completedAt) {
    return (
      <Card>
        <Text style={sharedStyles.sectionTitle}>{`${name} · Day ${today.dayNumber} logged ✓`}</Text>
        {viewLink}
      </Card>
    );
  }

  return (
    <Card>
      <Text style={sharedStyles.sectionTitle}>{name}</Text>
      <Text style={sharedStyles.helperText}>No routine scheduled today</Text>
      {viewLink}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View style={sharedStyles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  link: { color: COLORS.accent, fontWeight: '600' },
});
