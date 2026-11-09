// apps/mobile/app/(tabs)/index.tsx
//
// Workout tab (spec section 1): in-progress banner or "Start empty
// workout", the sprint card, routines, and the 3 most recent saved workouts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, fetchWorkoutHistory, startSprintWorkout, startWorkout, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary, type WorkoutListItem,
} from '../../lib/workouts';
import { fetchRoutinesAndFolders, startRoutineWorkout, type Routine, type RoutineFolder } from '../../lib/routines';
import { fetchInFlightSprint, fetchPainPoints, fetchTodaySprintDay, type PainPoint, type Sprint, type SprintDay } from '../../lib/sprintLifecycle';
import { defaultWorkoutTitle } from '../../lib/workoutTitles';
import { handleStartResult } from '../../lib/workoutStart';
import ActiveWorkoutBanner from '../../components/ActiveWorkoutBanner';
import WorkoutListRow from '../../components/WorkoutListRow';
import SprintCard from '../../components/SprintCard';
import RoutinesSection from '../../components/routines/RoutinesSection';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function WorkoutTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveWorkoutSummary | null>(null);
  const [recent, setRecent] = useState<WorkoutListItem[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [folders, setFolders] = useState<RoutineFolder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Synchronous guard: two taps can land before `starting` re-renders.
  const startingRef = useRef(false);
  const loadedRef = useRef(false);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner and Alerts, 'focus' (tab focus / change events) is silent.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [a, r, s, pp, rf] = await Promise.all([
        fetchActiveWorkout(),
        fetchWorkoutHistory(null, 3),
        fetchInFlightSprint(),
        fetchPainPoints(),
        // Routines are secondary: a failure here must not blank the whole tab.
        fetchRoutinesAndFolders().catch(() => null),
      ]);
      if (rf) {
        setFolders(rf.folders);
        setRoutines(rf.routines);
      }
      setActive(a);
      setRecent(r);
      setSprint(s);
      setPainPoints(pp);
      setToday(s && s.status === 'active' ? await fetchTodaySprintDay(s.id) : null);
      setLoadError(null);
      loadedRef.current = true;
    } catch (err: any) {
      if (mode === 'initial') setLoadError(err?.message ?? 'Failed to load.');
      else if (mode === 'refresh') reportError(err, 'Could not refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // useFocusEffect also runs on mount, so it does the first load too.
  useFocusEffect(
    useCallback(() => {
      load(loadedRef.current ? 'focus' : 'initial');
    }, [load])
  );
  useEffect(() => subscribeToActiveWorkoutChanges(() => load('focus')), [load]);

  async function handleStartEmpty() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      handleStartResult(await startWorkout({ source: 'empty', title: defaultWorkoutTitle(new Date()) }), router);
    } catch (err) {
      reportError(err, 'Could not start a workout.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleStartSavedRoutine(routine: Routine) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const result = await startRoutineWorkout(routine);
      handleStartResult(result, router);
      if (result.ok && result.skipped && result.skipped.length > 0) {
        Alert.alert('Some exercises were skipped', `These no longer exist: ${result.skipped.join(', ')}.`);
      }
    } catch (err) {
      reportError(err, 'Could not start this routine.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleStartRoutine() {
    if (!today || !sprint) return;
    if (startingRef.current) return;
    const name = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
    startingRef.current = true;
    setStarting(true);
    try {
      handleStartResult(await startSprintWorkout(today, name), router);
    } catch (err) {
      reportError(err, "Could not start today's routine.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.retryingButton]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load('initial'); // failure puts the new message in loadError
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }

  const painPointName = sprint ? painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? null : null;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
    >
      {active ? (
        <ActiveWorkoutBanner workout={active} onDiscarded={() => load('refresh')} />
      ) : (
        <Pressable style={sharedStyles.primaryButton} disabled={starting} onPress={handleStartEmpty}>
          <Text style={sharedStyles.primaryButtonText}>{starting ? 'Starting…' : 'Start empty workout'}</Text>
        </Pressable>
      )}
      <SprintCard
        sprint={sprint}
        painPointName={painPointName}
        today={today}
        activeWorkout={active}
        starting={starting}
        onStartRoutine={handleStartRoutine}
        onOpenSprint={() => router.push('/sprint')}
      />
      <RoutinesSection folders={folders} routines={routines} starting={starting || !!active} onStart={handleStartSavedRoutine} onChanged={() => load('focus')} />
      <View style={styles.sectionHeader}>
        <Text style={TYPE.sectionTitle}>Recent</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push('/history')}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        )}
      </View>
      {recent.length === 0 ? (
        <Text style={sharedStyles.helperText}>No workouts yet. Start one above.</Text>
      ) : (
        recent.map((item) => <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  retryingButton: { opacity: 0.6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
});
