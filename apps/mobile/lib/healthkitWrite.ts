// apps/mobile/lib/healthkitWrite.ts
//
// "Save workouts to Apple Health": after a successful finish, and only when
// the user turned the setting on, write one workout sample. This is
// write-only -- the app does not read Health data. Activity type follows the
// workout's dominant set kind: hold -> flexibility, weight x reps ->
// traditional strength, reps -> functional strength, duration -> mixed cardio.
// Failures are silent (console.warn): Health is a nice-to-have, never a
// reason a finish fails.
import { Platform } from 'react-native';
import HealthKit, { WorkoutActivityType, WorkoutTypeIdentifier } from '@kingstinct/react-native-healthkit';
import type { SetKind } from './setFields';
import { fetchUserSettings } from './userSettings';

export function activityTypeFor(kind: SetKind): WorkoutActivityType {
  switch (kind) {
    case 'hold':
      return WorkoutActivityType.flexibility;
    case 'weight_reps':
      return WorkoutActivityType.traditionalStrengthTraining;
    case 'reps':
      return WorkoutActivityType.functionalStrengthTraining;
    case 'duration':
      return WorkoutActivityType.mixedCardio;
  }
}

/** Asks for permission to write workouts; resolves false if unavailable or denied. */
export async function requestHealthWriteAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await HealthKit.requestAuthorization({ toShare: [WorkoutTypeIdentifier] });
  } catch (err) {
    console.warn('HealthKit write authorization failed:', err);
    return false;
  }
}

export async function saveWorkoutToHealth(w: { startedAt: string; endedAt: string; dominantKind: SetKind }): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const settings = await fetchUserSettings();
    if (!settings.healthkitWriteEnabled) return;
    await HealthKit.saveWorkoutSample(
      activityTypeFor(w.dominantKind),
      [],
      new Date(w.startedAt),
      new Date(w.endedAt)
    );
  } catch (err) {
    console.warn('Saving workout to Apple Health failed:', err);
  }
}
