// apps/mobile/components/ActiveWorkoutBanner.tsx
//
// In-progress workout banner, rendered at the top of the Workout and
// History tabs' content (spec section 1). Tap resumes; × discards.
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import { discardWorkout, type ActiveWorkoutSummary } from '../lib/workouts';

const TICK_MS = 15000;

function elapsedMinutes(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

export default function ActiveWorkoutBanner({
  workout,
  onDiscarded,
}: {
  workout: ActiveWorkoutSummary;
  onDiscarded: () => void;
}) {
  const router = useRouter();
  const [, setTick] = useState(0);
  // A fast double tap would push two logger screens.
  const lastPushRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  function handleDiscard() {
    Alert.alert('Discard this workout?', 'Every set logged in it will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardWorkout(workout.id)
            .then(onDiscarded)
            .catch((err: any) => Alert.alert('Error', err?.message ?? 'Could not discard.'));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.tapArea}
        onPress={() => {
          const t = Date.now();
          if (t - lastPushRef.current < 1000) return;
          lastPushRef.current = t;
          router.push(`/workout/${workout.id}`);
        }}
      >
        <View style={styles.dot} />
        <Text style={styles.text} numberOfLines={1}>
          {workout.title} · {elapsedMinutes(workout.startedAt)} min
        </Text>
        <Text style={styles.resume}>Resume</Text>
      </Pressable>
      <Pressable onPress={handleDiscard} hitSlop={8} accessibilityLabel="Discard workout" style={styles.discard}>
        <Text style={styles.discardText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADII.card,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  tapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  text: { ...TYPE.body, color: COLORS.card, fontWeight: '600', flex: 1 },
  resume: { ...TYPE.label, color: COLORS.card },
  discard: { paddingHorizontal: SPACING.xs },
  discardText: { color: COLORS.card, fontWeight: '700', fontSize: 20, lineHeight: 22 },
});
