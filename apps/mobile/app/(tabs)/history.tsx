// apps/mobile/app/(tabs)/history.tsx
//
// History tab (spec section 6): saved workouts grouped by week, paged 30 at
// a time, with the in-progress banner on top.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, fetchWorkoutHistory, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary, type WorkoutListItem,
} from '../../lib/workouts';
import { groupByWeek } from '../../lib/historyGrouping';
import ActiveWorkoutBanner from '../../components/ActiveWorkoutBanner';
import WorkoutListRow from '../../components/WorkoutListRow';

const PAGE_SIZE = 30;

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function HistoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveWorkoutSummary | null>(null);
  const [items, setItems] = useState<WorkoutListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const loadedRef = useRef(false);
  // How many rows "Load more" has revealed, so a focus reload (e.g. back from
  // a workout detail) doesn't truncate the list to the first page.
  const loadedCountRef = useRef(PAGE_SIZE);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner and Alerts, 'focus' (tab focus / change events) is silent.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    const limit = mode === 'focus' ? Math.max(PAGE_SIZE, loadedCountRef.current) : PAGE_SIZE;
    try {
      const [a, page] = await Promise.all([fetchActiveWorkout(), fetchWorkoutHistory(0, limit)]);
      setActive(a);
      setItems(page);
      loadedCountRef.current = Math.max(PAGE_SIZE, page.length);
      setHasMore(page.length === limit);
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

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchWorkoutHistory(items.length, PAGE_SIZE);
      const next = [...items, ...page];
      loadedCountRef.current = next.length;
      setItems(next);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      reportError(err, 'Could not load more workouts.');
    } finally {
      setLoadingMore(false);
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

  const groups = groupByWeek(items, new Date());

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
    >
      {active && <ActiveWorkoutBanner workout={active} onDiscarded={() => load('refresh')} />}
      {items.length === 0 ? (
        <Text style={sharedStyles.helperText}>No workouts yet — start one from the Workout tab.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={TYPE.sectionTitle}>{group.label}</Text>
            {group.items.map((item) => (
              <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />
            ))}
          </View>
        ))
      )}
      {hasMore && (
        <Pressable style={sharedStyles.primaryButton} disabled={loadingMore} onPress={loadMore}>
          <Text style={sharedStyles.primaryButtonText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  group: { gap: SPACING.sm },
});
