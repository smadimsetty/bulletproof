// apps/mobile/app/(tabs)/progress.tsx
//
// Progress tab (replaces Trends; History merged in 2026-11-13): consistency streak +
// calendar, assessments per area and past workouts (both as drop-downs), recent PRs,
// and monthly recap entry points. One parallel fetch feeds
// pure calculators in lib/stats/. Every section renders an empty state for a
// brand-new user.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BANNER_CLEARANCE, COLORS, TYPE } from '../../lib/theme';
import { CompactHeaderBar, ErrorState, LargeHeader, ScreenScroll, SkeletonCard, SkeletonStat, useScreenScroll } from '../../components/ui';
import { fetchStatsDataset, type StatsWorkout } from '../../lib/stats/dataset';
import { computeConsistency } from '../../lib/stats/consistency';
import { computePrEvents } from '../../lib/stats/prs';
import { buildTestTrends } from '../../lib/stats/assessmentTrends';
import { fetchUserSettings, updateUserSettings, DEFAULT_SETTINGS, type UserSettings } from '../../lib/userSettings';
import { fetchAllAssessments, fetchAssessmentDefinitions } from '../../lib/sprintAssessment';
import { fetchPainPoints } from '../../lib/sprintLifecycle';
import ConsistencyCard from '../../components/progress/ConsistencyCard';
import MonthCalendar from '../../components/progress/MonthCalendar';
import AssessmentTrendsSection, { type PainPointTrends } from '../../components/progress/AssessmentTrendsSection';
import RecentPrsCard from '../../components/progress/RecentPrsCard';
import RecapEntryCard from '../../components/progress/RecapEntryCard';
import WeeklyGoalSheet from '../../components/progress/WeeklyGoalSheet';
import WorkoutHistorySection from '../../components/progress/WorkoutHistorySection';
import { countFinishedWorkouts, fetchWorkoutHistory, subscribeToActiveWorkoutChanges, type WorkoutListItem } from '../../lib/workouts';
import { getMyId } from '../../lib/session';

const PAGE_SIZE = 30;

interface Loaded {
  history: WorkoutListItem[];
  workouts: StatsWorkout[];
  settings: UserSettings;
  trendGroups: PainPointTrends[];
}

async function loadAll(historyLimit: number): Promise<Loaded> {
  const [history, workouts, settings, assessments, painPoints] = await Promise.all([
    fetchWorkoutHistory(null, historyLimit),
    fetchStatsDataset(),
    fetchUserSettings(),
    fetchAllAssessments(),
    fetchPainPoints(),
  ]);
  const assessed = painPoints.filter((p) => assessments.some((a) => a.painPointId === p.id));
  const trendGroups = await Promise.all(
    assessed.map(async (p) => ({
      painPointId: p.id,
      displayName: p.displayName,
      trends: buildTestTrends(
        await fetchAssessmentDefinitions(p.id),
        assessments.filter((a) => a.painPointId === p.id)
      ),
    }))
  );
  return { history, workouts, settings, trendGroups };
}

export default function ProgressScreen() {
  const router = useRouter();
  const scrollY = useScreenScroll();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // How many past workouts are revealed, so a focus reload doesn't drop older pages.
  const historyLimitRef = useRef(PAGE_SIZE);
  const loadedRef = useRef(false);
  const now = useMemo(() => new Date(), [data]);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner, 'focus' is silent -- a failed background reload keeps old data.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const loaded = await loadAll(historyLimitRef.current);
      setData(loaded);
      setHasMore(loaded.history.length === historyLimitRef.current);
      getMyId().then(countFinishedWorkouts).then(setTotal).catch(() => undefined);
      setLoadError(null);
      loadedRef.current = true;
    } catch (err: any) {
      if (mode !== 'focus' || !loadedRef.current) setLoadError(err?.message ?? 'Failed to load progress.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(loadedRef.current ? 'focus' : 'initial');
    }, [load])
  );
  useEffect(() => subscribeToActiveWorkoutChanges(() => load('focus')), [load]);

  async function loadMore() {
    const items = data?.history ?? [];
    const last = items[items.length - 1];
    if (loadingMore || !last?.endedAt) return;
    setLoadingMore(true);
    try {
      const page = await fetchWorkoutHistory({ endedAt: last.endedAt, id: last.id }, PAGE_SIZE);
      historyLimitRef.current = Math.max(PAGE_SIZE, items.length + page.length);
      setHasMore(page.length === PAGE_SIZE);
      setData((d) => (d ? { ...d, history: [...d.history, ...page] } : d));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not load more workouts.');
    } finally {
      setLoadingMore(false);
    }
  }

  const computed = useMemo(() => {
    if (!data) return null;
    const consistency = computeConsistency(
      data.workouts.map((w) => w.endedAt),
      data.settings.weeklyGoal,
      now
    );
    return { consistency, prEvents: computePrEvents(data.workouts).events };
  }, [data, now]);

  async function saveGoal(goal: number) {
    const saved = await updateUserSettings({ weeklyGoal: goal });
    setData((d) => (d ? { ...d, settings: saved } : d));
  }

  const header = <LargeHeader title="Progress" />;

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {header}
          <SkeletonStat />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScreenScroll>
      </View>
    );
  }
  if (loadError && !data) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {header}
          <ErrorState
            message={loadError}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load('initial');
              setRetrying(false);
            }}
          />
        </ScreenScroll>
      </View>
    );
  }
  if (!data || !computed) return null;

  const settings = data.settings ?? DEFAULT_SETTINGS;
  return (
    <View style={styles.root}>
      <ScreenScroll
        scrollY={scrollY}
        refreshing={refreshing}
        onRefresh={() => load('refresh')}
        contentContainerStyle={styles.content}
      >
        {header}
        {loadError ? <Text style={[TYPE.footnote, { color: COLORS.danger }]}>{loadError}</Text> : null}
        <ConsistencyCard consistency={computed.consistency} onPress={() => setGoalOpen(true)} />
        <MonthCalendar workouts={data.workouts} now={now} />
        <AssessmentTrendsSection groups={data.trendGroups} onStartSprint={() => router.push('/sprint')} />
        <WorkoutHistorySection
          items={data.history}
          total={total}
          hasMore={hasMore}
          loadingMore={loadingMore}
          now={now}
          onLoadMore={loadMore}
          onOpenWorkout={(id) => router.push(`/workout-summary/${id}`)}
          onStartWorkout={() => router.navigate('/')}
        />
        <RecentPrsCard
          events={computed.prEvents}
          weightUnit={settings.weightUnit}
          now={now}
          onOpenExercise={(id) => router.push(`/exercise/${id}`)}
        />
        <RecapEntryCard
          now={now}
          workouts={data.workouts}
          onOpen={(year, month0) => router.push(`/recap?year=${year}&month=${month0}`)}
        />
      </ScreenScroll>
      <CompactHeaderBar title="Progress" scrollY={scrollY} />
      <WeeklyGoalSheet
        visible={goalOpen}
        current={settings.weeklyGoal}
        onClose={() => setGoalOpen(false)}
        onSave={saveGoal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  // Leave room for the docked active-workout banner.
  content: { paddingBottom: BANNER_CLEARANCE },
});
