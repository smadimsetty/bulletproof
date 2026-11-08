// apps/mobile/lib/workoutStart.ts
// Shared handling of startWorkout/startSprintWorkout results: navigate on
// success; on an in-progress conflict, offer to resume the other workout.
import { Alert } from 'react-native';
import type { StartResult } from './workouts';

export function handleStartResult(result: StartResult, router: { push: (href: string) => void }): void {
  if (result.ok) {
    router.push(`/workout/${result.workoutId}`);
    return;
  }
  const activeId = result.activeWorkoutId;
  Alert.alert('You already have a workout in progress', 'Finish or discard it before starting another.', [
    { text: 'Cancel', style: 'cancel' },
    ...(activeId ? [{ text: 'Resume', onPress: () => router.push(`/workout/${activeId}`) }] : []),
  ]);
}
