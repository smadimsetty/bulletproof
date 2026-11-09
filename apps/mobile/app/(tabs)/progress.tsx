// apps/mobile/app/(tabs)/progress.tsx
//
// Progress tab (replaces Trends): consistency streak + calendar, assessment
// trends, recent PRs, and monthly recap entry points. One parallel fetch feeds
// pure calculators in lib/stats/. Every section renders an empty state for a
// brand-new user.
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, LEGACY_SPACING as SPACING, TYPE, sharedStyles } from '../../lib/theme';
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

interface Loaded {
  workouts: StatsWorkout[];
  settings: UserSettings;
  trendGroups: PainPointTrends[];
}

async function loadAll(): Promise<Loaded> {
  const [workouts, settings, assessments, painPoints] = await Promise.all([
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
  return { workouts, settings, trendGroups };
}

export default function ProgressScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const loadedRef = useRef(false);
  const now = useMemo(() => new Date(), [data]);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner, 'focus' is silent -- a failed background reload keeps old data.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      setData(await loadAll());
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

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (loadError && !data) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && { opacity: 0.6 }]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load('initial');
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }
  if (!data || !computed) return null;

  const settings = data.settings ?? DEFAULT_SETTINGS;
  return (
    <>
      <ScrollView
        style={sharedStyles.screen}
        contentContainerStyle={sharedStyles.screenContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
      >
        {loadError && <Text style={sharedStyles.warningText}>{loadError}</Text>}
        <ConsistencyCard
          consistency={computed.consistency}
          hasAnyWorkout={data.workouts.length > 0}
          onPress={() => setGoalOpen(true)}
        />
        <MonthCalendar workouts={data.workouts} now={now} />
        <AssessmentTrendsSection groups={data.trendGroups} />
        <RecentPrsCard
          events={computed.prEvents}
          weightUnit={settings.weightUnit}
          now={now}
          onOpenExercise={(id) => router.push(`/exercise/${id}`)}
        />
        <RecapEntryCard
          now={now}
          onOpen={(year, month0) => router.push(`/recap?year=${year}&month=${month0}`)}
        />
      </ScrollView>
      <WeeklyGoalSheet
        visible={goalOpen}
        current={settings.weeklyGoal}
        onClose={() => setGoalOpen(false)}
        onSave={saveGoal}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
});
