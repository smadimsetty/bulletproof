// apps/mobile/app/(tabs)/index.tsx
//
// Workout tab (visual spec 4.3): in-progress card or "Start empty workout",
// the sprint card, routines, and the 3 most recent saved workouts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, fetchWorkoutHistory, startSprintWorkout, startWorkout, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary, type WorkoutListItem,
} from '../../lib/workouts';
import { fetchRoutinesAndFolders, startRoutineWorkout, type Routine, type RoutineFolder } from '../../lib/routines';
import { fetchInFlightSprint, fetchPainPoints, fetchTodaySprintDay, type PainPoint, type Sprint, type SprintDay } from '../../lib/sprintLifecycle';
import { defaultWorkoutTitle } from '../../lib/workoutTitles';
import { handleStartResult } from '../../lib/workoutStart';
import WorkoutListRow from '../../components/WorkoutListRow';
import SprintCard from '../../components/SprintCard';
import RoutinesSection from '../../components/routines/RoutinesSection';
import {
  Button, Card, CompactHeaderBar, EmptyState, ErrorState, IconButton, LargeHeader, ScreenScroll, SectionHeader,
  SkeletonCard, SkeletonRow, useScreenScroll,
} from '../../components/ui';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function WorkoutTab() {
  const router = useRouter();
  const scrollY = useScreenScroll();
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
  // A fast double tap would push two logger screens.
  const lastPushRef = useRef(0);
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

  const header = (
    <LargeHeader
      title="Workout"
      actions={<IconButton icon="library-outline" accessibilityLabel="Exercise library" onPress={() => router.push('/library')} />}
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {header}
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ScreenScroll>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {header}
          <ErrorState
            message={loadError}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load('initial'); // failure puts the new message in loadError
              setRetrying(false);
            }}
          />
        </ScreenScroll>
      </View>
    );
  }

  const painPointName = sprint ? painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? null : null;

  return (
    <View style={styles.root}>
      <ScreenScroll
        scrollY={scrollY}
        refreshing={refreshing}
        onRefresh={() => load('refresh')}
        // Leave room for the docked active-workout banner.
        contentContainerStyle={active ? styles.withBanner : undefined}
      >
        {header}
        {active ? (
          <Card variant="accent" onPress={() => {
              const t = Date.now();
              if (t - lastPushRef.current < 1000) return;
              lastPushRef.current = t;
              router.push(`/workout/${active.id}`);
            }} accessibilityLabel={`Resume ${active.title}`}>
            <View style={styles.activeRow}>
              <Ionicons name="radio-button-on" size={14} color={COLORS.accent} />
              <Text style={[TYPE.bodyStrong, styles.activeTitle]} numberOfLines={1}>
                {active.title}
              </Text>
              <Text style={styles.resume}>Resume</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.accent} />
            </View>
          </Card>
        ) : null}
        <SprintCard
          sprint={sprint}
          painPointName={painPointName}
          today={today}
          activeWorkout={active}
          starting={starting}
          onStartRoutine={handleStartRoutine}
          onOpenSprint={() => router.push('/sprint')}
        />
        {active ? null : (
          <Button title="Start empty workout" icon="add" variant="secondary" size="lg" fullWidth loading={starting} onPress={handleStartEmpty} />
        )}
        <RoutinesSection folders={folders} routines={routines} starting={starting || !!active} onStart={handleStartSavedRoutine} onChanged={() => load('focus')} />
        <SectionHeader
          title="Recent"
          inset={SPACING.xs}
          action={recent.length > 0 ? { label: 'See all', onPress: () => router.navigate('/history') } : undefined}
        />
        {recent.length === 0 ? (
          <EmptyState compact icon="barbell-outline" title="No workouts yet" body="Your finished workouts will show up here." />
        ) : (
          recent.map((item) => <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />)
        )}
      </ScreenScroll>
      <CompactHeaderBar title="Workout" scrollY={scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  withBanner: { paddingBottom: 76 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  activeTitle: { flex: 1 },
  resume: { ...TYPE.callout, color: COLORS.accent, fontWeight: '700' },
});
