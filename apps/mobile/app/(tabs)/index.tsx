// apps/mobile/app/(tabs)/index.tsx
//
// Workout tab (spec section 1): in-progress banner or "Start empty
// workout", the sprint card, and the 3 most recent saved workouts.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, fetchWorkoutHistory, startSprintWorkout, startWorkout, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary, type WorkoutListItem,
} from '../../lib/workouts';
import { fetchInFlightSprint, fetchPainPoints, fetchTodaySprintDay, type PainPoint, type Sprint, type SprintDay } from '../../lib/sprintLifecycle';
import { defaultWorkoutTitle } from '../../lib/workoutTitles';
import { handleStartResult } from '../../lib/workoutStart';
import ActiveWorkoutBanner from '../../components/ActiveWorkoutBanner';
import WorkoutListRow from '../../components/WorkoutListRow';
import SprintCard from '../../components/SprintCard';

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
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [a, r, s, pp] = await Promise.all([fetchActiveWorkout(), fetchWorkoutHistory(0, 3), fetchInFlightSprint(), fetchPainPoints()]);
      setActive(a);
      setRecent(r);
      setSprint(s);
      setPainPoints(pp);
      setToday(s && s.status === 'active' ? await fetchTodaySprintDay(s.id) : null);
      setLoadError(null);
    } catch (err: any) {
      if (mode === 'initial') setLoadError(err?.message ?? 'Failed to load.');
      else reportError(err, 'Could not refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load('refresh');
    }, [load])
  );
  useEffect(() => subscribeToActiveWorkoutChanges(() => load('refresh')), [load]);

  async function handleStartEmpty() {
    setStarting(true);
    try {
      handleStartResult(await startWorkout({ source: 'empty', title: defaultWorkoutTitle(new Date()) }), router);
    } catch (err) {
      reportError(err, 'Could not start a workout.');
    } finally {
      setStarting(false);
    }
  }

  async function handleStartRoutine() {
    if (!today || !sprint) return;
    const name = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
    setStarting(true);
    try {
      handleStartResult(await startSprintWorkout(today, name), router);
    } catch (err) {
      reportError(err, "Could not start today's routine.");
    } finally {
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
        <Pressable style={sharedStyles.primaryButton} onPress={() => { setLoading(true); load('initial'); }}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
});
