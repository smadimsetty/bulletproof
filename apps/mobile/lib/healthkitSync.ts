// apps/mobile/lib/healthkitSync.ts
//
// Reads HealthKit workout samples since the last sync and upserts them
// into the `activity` table. See
// docs/superpowers/specs/2026-06-22-healthkit-sync-design.md for the full
// design (Decisions 2-6 cover permission scope, sync trigger, the
// AsyncStorage timestamp key, row mapping, and permission-before-query
// ordering respectively).
import AsyncStorage from '@react-native-async-storage/async-storage';
import HealthKit, {
  WorkoutActivityType,
  WorkoutTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import type { QuantityTypeIdentifier, WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';
import { supabase } from './supabase';
import {
  groupWorkoutsByLocalDate,
  toActivityRows,
  type MinimalWorkoutSample,
} from './healthkitMapping';

export const LAST_SYNCED_STORAGE_KEY = '@bulletproof/healthkit-last-synced';

/** First-ever sync (no stored timestamp yet) looks back this many days. */
const FIRST_SYNC_LOOKBACK_DAYS = 30;

/**
 * HealthKit read permissions this app requests. Only `WorkoutTypeIdentifier`
 * is actually queried this phase -- the three quantity types are requested
 * now, once, for forward compatibility (see design spec Decision 2) so a
 * future feature querying them doesn't need a second permission prompt.
 */
const READ_PERMISSIONS: readonly (typeof WorkoutTypeIdentifier | QuantityTypeIdentifier)[] = [
  WorkoutTypeIdentifier,
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierStepCount',
];

function toMinimalSample(workout: WorkoutProxyTyped): MinimalWorkoutSample {
  return {
    uuid: workout.uuid,
    startDate: workout.startDate,
    endDate: workout.endDate,
    workoutActivityTypeName:
      WorkoutActivityType[workout.workoutActivityType] ?? 'other',
    totalEnergyBurnedKcal: workout.totalEnergyBurned?.quantity ?? null,
    totalDistanceMeters: workout.totalDistance?.quantity ?? null,
  };
}

async function getSinceDate(): Promise<Date> {
  const stored = await AsyncStorage.getItem(LAST_SYNCED_STORAGE_KEY);
  if (stored) {
    return new Date(stored);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - FIRST_SYNC_LOOKBACK_DAYS);
  return fallback;
}

/**
 * Reads HealthKit workout samples since the last sync and upserts them
 * into the `activity` table. Safe to call repeatedly (idempotent upsert
 * keyed on `date`) and safe to call when HealthKit is unavailable or
 * permission is denied -- both cases skip silently rather than throwing,
 * since this is a read-augmentation feature that must never block the
 * rest of the app from working.
 */
export async function syncHealthKitWorkouts(): Promise<void> {
  const available = await HealthKit.isHealthDataAvailable();
  if (!available) {
    return;
  }

  try {
    await HealthKit.requestAuthorization({ toRead: READ_PERMISSIONS });
  } catch (err) {
    console.warn('HealthKit authorization request failed or was denied:', err);
    return;
  }

  const since = await getSinceDate();
  const now = new Date();

  let workouts: readonly WorkoutProxyTyped[];
  try {
    workouts = await HealthKit.queryWorkoutSamples({
      filter: {
        date: { startDate: since },
      },
      limit: 0,
      ascending: true,
    });
  } catch (err) {
    console.warn('HealthKit workout query failed:', err);
    return;
  }

  if (workouts.length > 0) {
    const minimalSamples = workouts.map(toMinimalSample);
    const grouped = groupWorkoutsByLocalDate(minimalSamples);
    const rows = toActivityRows(grouped);

    const { error } = await supabase.from('activity').upsert(rows, { onConflict: 'date' });
    if (error) {
      console.warn('Failed to upsert HealthKit workouts into activity:', error.message);
      return;
    }
  }

  await AsyncStorage.setItem(LAST_SYNCED_STORAGE_KEY, now.toISOString());
}
