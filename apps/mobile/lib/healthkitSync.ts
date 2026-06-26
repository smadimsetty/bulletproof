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
  CategoryValueSleepAnalysis,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
  queryQuantitySamples,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import type {
  CategoryTypeIdentifier,
  QuantityTypeIdentifier,
  WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import { supabase } from './supabase';
import {
  groupWorkoutsByLocalDate,
  mergeDailyMetricsIntoActivityRows,
  sumQuantityByLocalDate,
  sumSleepMinutesByLocalDate,
  toActivityRows,
  type MinimalQuantitySample,
  type MinimalSleepSample,
  type MinimalWorkoutSample,
  type SleepCategoryValue,
} from './healthkitMapping';

export const LAST_SYNCED_STORAGE_KEY = '@bulletproof/healthkit-last-synced';

/** First-ever sync (no stored timestamp yet) looks back this many days. */
const FIRST_SYNC_LOOKBACK_DAYS = 30;

/**
 * HealthKit read permissions this app requests. `WorkoutTypeIdentifier` is
 * queried by syncHealthKitWorkouts(); the quantity types
 * (ActiveEnergyBurned/DistanceWalkingRunning/StepCount) and the new sleep
 * category type are queried by syncHealthKitDailyMetrics() below -- see
 * docs/superpowers/specs/2026-06-24-settings-healthkit-design.md Decision 2
 * for what's queried-and-persisted vs. queried-and-only-summarized.
 * Heart rate (current + resting) is queried for the Settings screen's
 * "what we read" disclosure only; neither is persisted to any table this
 * phase (recovery stays Oura-sourced).
 */
const READ_PERMISSIONS: readonly (
  | typeof WorkoutTypeIdentifier
  | QuantityTypeIdentifier
  | CategoryTypeIdentifier
)[] = [
  WorkoutTypeIdentifier,
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
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
 * Reads the signed-in user's user_profile.healthkit_sync_enabled flag.
 * Settings' toggle writes this column directly, but until this function
 * existed nothing ever read it back -- _layout.tsx called the sync
 * functions below unconditionally on every sign-in/foreground, so the
 * toggle had no effect on anything. Defaults to false (don't sync) on any
 * read failure, matching this feature's existing "never block the app"
 * posture -- HealthKit access is opt-in, so a failed read should not
 * silently opt the user back in.
 */
export async function isHealthKitSyncEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('user_profile').select('healthkit_sync_enabled').single();
  if (error || !data) {
    return false;
  }
  return Boolean((data as { healthkit_sync_enabled: boolean }).healthkit_sync_enabled);
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

/**
 * Reads HealthKit ActiveEnergyBurned/DistanceWalkingRunning/StepCount
 * quantity samples and SleepAnalysis category samples since the last
 * sync, sums calories and steps per local day, and upserts only those two
 * columns into the `activity` table -- a narrower upsert than
 * syncHealthKitWorkouts()'s full-row upsert, so it does not clobber
 * workouts/workout_count already written for the same date. Distance and
 * sleep totals are computed but not persisted this phase (see design spec
 * Decision 2) -- callers needing a human-readable summary of what was read
 * should call this and inspect its return value rather than relying on a
 * side effect.
 *
 * Same fail-soft contract as syncHealthKitWorkouts(): unavailable
 * HealthKit, denied permission, or a query/upsert error all skip silently
 * rather than throwing, since this is read-augmentation, never a gate on
 * app usability.
 */
export interface DailyMetricsSyncSummary {
  daysWithCalories: number;
  daysWithSteps: number;
  totalDistanceMeters: number;
  totalSleepMinutes: number;
  mostRecentHeartRateBpm: number | null;
  mostRecentRestingHeartRateBpm: number | null;
}

const EMPTY_SUMMARY: DailyMetricsSyncSummary = {
  daysWithCalories: 0,
  daysWithSteps: 0,
  totalDistanceMeters: 0,
  totalSleepMinutes: 0,
  mostRecentHeartRateBpm: null,
  mostRecentRestingHeartRateBpm: null,
};

function toMinimalQuantitySample(sample: {
  startDate: Date;
  endDate: Date;
  quantity: number;
}): MinimalQuantitySample {
  return { startDate: sample.startDate, endDate: sample.endDate, quantity: sample.quantity };
}

/**
 * Maps CategoryValueSleepAnalysis's numeric enum (the real type
 * @kingstinct/react-native-healthkit's queryCategorySamples returns -- see
 * design spec Decision 1) to the string-literal SleepCategoryValue union
 * healthkitMapping.ts's pure functions are tested against. asleepUnspecified
 * and asleep share numeric value 1; both map to the same "asleep" bucket in
 * sumSleepMinutesByLocalDate, so collapsing them to a single label here is
 * lossless for this app's purposes.
 */
const SLEEP_VALUE_LABEL: Record<CategoryValueSleepAnalysis, SleepCategoryValue> = {
  [CategoryValueSleepAnalysis.inBed]: 'inBed',
  [CategoryValueSleepAnalysis.asleep]: 'asleep',
  [CategoryValueSleepAnalysis.awake]: 'awake',
  [CategoryValueSleepAnalysis.asleepCore]: 'asleepCore',
  [CategoryValueSleepAnalysis.asleepDeep]: 'asleepDeep',
  [CategoryValueSleepAnalysis.asleepREM]: 'asleepREM',
};

function toMinimalSleepSample(sample: {
  startDate: Date;
  endDate: Date;
  value: CategoryValueSleepAnalysis;
}): MinimalSleepSample {
  return {
    startDate: sample.startDate,
    endDate: sample.endDate,
    categoryValue: SLEEP_VALUE_LABEL[sample.value] ?? 'asleepUnspecified',
  };
}

export async function syncHealthKitDailyMetrics(): Promise<DailyMetricsSyncSummary> {
  const available = await HealthKit.isHealthDataAvailable();
  if (!available) {
    return EMPTY_SUMMARY;
  }

  try {
    await HealthKit.requestAuthorization({ toRead: READ_PERMISSIONS });
  } catch (err) {
    console.warn('HealthKit authorization request failed or was denied:', err);
    return EMPTY_SUMMARY;
  }

  const since = await getSinceDate();
  const filter = { date: { startDate: since } };

  let activeEnergySamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let distanceSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let stepSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let sleepSamples: readonly { startDate: Date; endDate: Date; value: CategoryValueSleepAnalysis }[] = [];
  let heartRateSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];
  let restingHeartRateSamples: readonly { startDate: Date; endDate: Date; quantity: number }[] = [];

  try {
    [
      activeEnergySamples,
      distanceSamples,
      stepSamples,
      sleepSamples,
      heartRateSamples,
      restingHeartRateSamples,
    ] = await Promise.all([
      queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierDistanceWalkingRunning', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierStepCount', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        filter,
        limit: 0,
        ascending: true,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        filter,
        limit: 0,
        ascending: false,
      }),
      queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
        filter,
        limit: 0,
        ascending: false,
      }),
    ]);
  } catch (err) {
    console.warn('HealthKit daily metrics query failed:', err);
    return EMPTY_SUMMARY;
  }

  const caloriesByDay = sumQuantityByLocalDate(activeEnergySamples.map(toMinimalQuantitySample));
  const distanceByDay = sumQuantityByLocalDate(distanceSamples.map(toMinimalQuantitySample));
  const stepsByDay = sumQuantityByLocalDate(stepSamples.map(toMinimalQuantitySample));
  const sleepMinutesByDay = sumSleepMinutesByLocalDate(sleepSamples.map(toMinimalSleepSample));

  const rows = mergeDailyMetricsIntoActivityRows(caloriesByDay, stepsByDay);
  if (rows.length > 0) {
    const { error } = await supabase
      .from('activity')
      .upsert(rows, { onConflict: 'date' });
    if (error) {
      console.warn('Failed to upsert HealthKit daily metrics into activity:', error.message);
      return EMPTY_SUMMARY;
    }
  }

  let totalDistanceMeters = 0;
  for (const meters of distanceByDay.values()) {
    totalDistanceMeters += meters;
  }
  let totalSleepMinutes = 0;
  for (const minutes of sleepMinutesByDay.values()) {
    totalSleepMinutes += minutes;
  }

  return {
    daysWithCalories: caloriesByDay.size,
    daysWithSteps: stepsByDay.size,
    totalDistanceMeters,
    totalSleepMinutes,
    mostRecentHeartRateBpm: heartRateSamples[0]?.quantity ?? null,
    mostRecentRestingHeartRateBpm: restingHeartRateSamples[0]?.quantity ?? null,
  };
}
