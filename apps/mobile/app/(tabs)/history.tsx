// apps/mobile/app/(tabs)/history.tsx
//
// History tab (visual spec 4.8): a this-week / this-month / total strip, then
// saved workouts grouped by month with sticky month headers, paged 30 at a time
// (keyset load-more via onEndReached). The in-progress banner is now global (tabs layout).
// TODO(stage4): spec mentions swipe-to-delete on rows; this screen never had a delete action
// (deleting lives on the workout detail), so none was added.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import { countFinishedWorkouts, fetchWorkoutHistory, subscribeToActiveWorkoutChanges, type WorkoutListItem } from '../../lib/workouts';
import { countThisWeekAndMonth, groupByMonth } from '../../lib/historyGrouping';
import { getMyId } from '../../lib/session';
import WorkoutListRow from '../../components/WorkoutListRow';
import { Card, EmptyState, ErrorState, IconButton, LargeHeader, SkeletonRow, Stat } from '../../components/ui';

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
  const [items, setItems] = useState<WorkoutListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const loadedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  // How many rows "Load more" has revealed, so a focus reload (e.g. back from
  // a workout detail) doesn't truncate the list to the first page.
  const loadedCountRef = useRef(PAGE_SIZE);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner and Alerts, 'focus' (tab focus / change events) is silent.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    const limit = mode === 'focus' ? Math.max(PAGE_SIZE, loadedCountRef.current) : PAGE_SIZE;
    try {
      const page = await fetchWorkoutHistory(null, limit);
      setItems(page);
      loadedCountRef.current = Math.max(PAGE_SIZE, page.length);
      setHasMore(page.length === limit);
      setLoadError(null);
      loadedRef.current = true;
      // The lifetime total is secondary: a failure just leaves the tile at what is loaded.
      getMyId()
        .then(countFinishedWorkouts)
        .then(setTotal)
        .catch(() => undefined);
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
    if (loadingMoreRef.current || !hasMore || items.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const page = await fetchWorkoutHistory(last ? { endedAt: last.endedAt!, id: last.id } : null, PAGE_SIZE);
      const next = [...items, ...page];
      loadedCountRef.current = next.length;
      setItems(next);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      reportError(err, 'Could not load more workouts.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  const header = (
    <LargeHeader
      title="History"
      actions={<IconButton icon="calendar-outline" accessibilityLabel="Calendar" onPress={() => router.navigate('/progress')} />}
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          {header}
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
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
        </View>
      </View>
    );
  }

  const now = new Date();
  const { week, month } = countThisWeekAndMonth(items, now);
  const sections = groupByMonth(items).map((g) => ({ title: g.label, data: g.items }));

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        indicatorStyle="white"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              haptics.tap();
              load('refresh');
            }}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {header}
            <View style={styles.strip}>
              <Card padding={14} style={styles.tile}>
                <Stat size="md" label="This week" value={week} />
              </Card>
              <Card padding={14} style={styles.tile}>
                <Stat size="md" label="This month" value={month} />
              </Card>
              <Card padding={14} style={styles.tile}>
                <Stat size="md" label="Total" value={Math.max(total ?? 0, items.length)} />
              </Card>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={TYPE.overline}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => <WorkoutListRow item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />}
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title="No workouts yet"
            body="Finish a workout and it'll land here."
            action={{ label: 'Start a workout', onPress: () => router.navigate('/') }}
            style={styles.empty}
          />
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.accent} style={styles.footer} /> : <View style={styles.footer} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 96 },
  headerBlock: { gap: SPACING.sm },
  strip: { flexDirection: 'row', gap: SPACING.md },
  tile: { flex: 1, minHeight: 96, justifyContent: 'center' },
  sectionHeader: { backgroundColor: 'rgba(11,12,15,0.95)', paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  empty: { alignSelf: 'center', marginTop: SPACING.xxl },
  footer: { height: SPACING.xl, marginTop: SPACING.md },
});
