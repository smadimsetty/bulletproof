// apps/mobile/app/recap.tsx
//
// Monthly recap (visual spec 4.10): a hero numeral, stat tiles, sprint ring,
// PRs and top exercises, with a Share footer that renders a branded card to an
// image. ?year=&month= (month is 0-based); defaults to last month.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, MOTION, RADII, SPACING, TYPE } from '../lib/theme';
import { fetchStatsDataset, type StatsWorkout } from '../lib/stats/dataset';
import { computePrEvents } from '../lib/stats/prs';
import { buildMonthlyRecap } from '../lib/stats/recap';
import { PR_KIND_LABEL, formatPrValue, monthName, sideSuffix } from '../lib/stats/format';
import { fetchUserSettings, DEFAULT_SETTINGS, type UserSettings } from '../lib/userSettings';
import { shareViewAsImage } from '../lib/shareImage';
import * as haptics from '../lib/haptics';
import ShareCard from '../components/share/ShareCard';
import {
  AnimatedNumber, Button, Card, EmptyState, ErrorState, IconButton, ProgressRing, ScreenScroll, SectionHeader,
  SkeletonCard, SkeletonStat, Stat, StickyFooter,
} from '../components/ui';

function initialMonth(year?: string, month?: string): { year: number; month0: number } {
  const y = Number(year);
  const m = Number(month);
  if (year != null && month != null && Number.isInteger(y) && Number.isInteger(m) && m >= 0 && m <= 11) {
    return { year: y, month0: m };
  }
  const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  return { year: prev.getFullYear(), month0: prev.getMonth() };
}

function hoursLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const SPRINT_DAYS = 14;

export default function RecapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  const [cursor, setCursor] = useState(() => initialMonth(params.year, params.month));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<StatsWorkout[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([fetchStatsDataset(), fetchUserSettings()]);
      setWorkouts(w);
      setSettings(s);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load recap.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const recap = useMemo(
    () => buildMonthlyRecap(workouts, computePrEvents(workouts).events, cursor.year, cursor.month0),
    [workouts, cursor]
  );

  const now = new Date();
  const isCurrent = cursor.year === now.getFullYear() && cursor.month0 === now.getMonth();
  function shift(delta: number) {
    haptics.select();
    setCursor((c) => {
      const d = new Date(c.year, c.month0 + delta, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      await shareViewAsImage(cardRef, `${monthName(cursor.year, cursor.month0)} recap`);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not share', err?.message ?? 'Something went wrong.');
    } finally {
      setSharing(false);
    }
  }

  const month = monthName(cursor.year, cursor.month0);
  // TODO(stage4): spec shows "LONGEST STREAK 3 wk" (weeks); the recap data computes a longest
  // *daily* streak, so the tile keeps showing days.
  const tiles: { label: string; value: number | string }[] = [
    { label: 'Active days', value: recap.activeDays },
    { label: 'Total time', value: hoursLabel(recap.totalMinutes) },
    { label: 'Longest streak', value: `${recap.longestDailyStreak}d` },
    { label: 'PRs', value: recap.prs.length },
  ];
  const empty = !loading && !error && recap.workouts === 0;
  const content = !loading && !error && !empty;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Recap',
          headerRight: () => (
            <IconButton icon="share-outline" size="sm" accessibilityLabel="Share recap" disabled={sharing || !content} onPress={share} />
          ),
        }}
      />
      <ScreenScroll>
        <View style={styles.switcher}>
          <IconButton icon="chevron-back" accessibilityLabel="Previous month" onPress={() => shift(-1)} />
          <Text style={TYPE.title2}>{`${month} ${cursor.year}`}</Text>
          <IconButton icon="chevron-forward" accessibilityLabel="Next month" disabled={isCurrent} onPress={() => shift(1)} />
        </View>

        {loading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : empty ? (
          <EmptyState
            icon="calendar-clear-outline"
            title={`Nothing logged in ${month}`}
            body="Recaps fill in as you train."
            action={{ label: 'Start a workout', onPress: () => router.navigate('/') }}
          />
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={TYPE.overline}>Workouts</Text>
              <AnimatedNumber value={recap.workouts} style={TYPE.display} />
            </View>

            <View style={styles.tiles}>
              {tiles.map((t, i) => (
                <Animated.View
                  key={t.label}
                  style={styles.tile}
                  entering={FadeInDown.duration(MOTION.base).delay(i * MOTION.stagger)}
                >
                  <Card padding={14} style={styles.tileCard}>
                    <Stat size="md" label={t.label} value={t.value} />
                  </Card>
                </Animated.View>
              ))}
            </View>

            <Card>
              <Text style={TYPE.title3}>Top exercises</Text>
              {recap.topExercises.length === 0 ? (
                <Text style={TYPE.footnote}>Nothing logged yet.</Text>
              ) : (
                recap.topExercises.map((e, i) => (
                  <View key={e.name} style={styles.topRow}>
                    <Text style={[TYPE.stat, styles.rank]}>{i + 1}</Text>
                    <Text style={[TYPE.bodyStrong, styles.topName]} numberOfLines={2}>
                      {e.name}
                    </Text>
                    <Text style={TYPE.footnote}>{`${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`}</Text>
                  </View>
                ))
              )}
            </Card>

            {recap.sprintDaysLogged > 0 ? (
              <Card>
                <Text style={TYPE.title3}>Sprint</Text>
                <View style={styles.sprintRow}>
                  <ProgressRing progress={recap.sprintDaysLogged / SPRINT_DAYS} size={72} current={recap.sprintDaysLogged} total={SPRINT_DAYS} />
                  <Text style={[TYPE.callout, styles.sprintText]}>
                    {`${recap.sprintDaysLogged} sprint ${recap.sprintDaysLogged === 1 ? 'day' : 'days'} logged in ${month}.`}
                  </Text>
                </View>
              </Card>
            ) : null}
            {/* TODO(stage4): spec also shows assessment delta chips on the Sprint card; the recap data has no assessment deltas. */}

            <SectionHeader title="Personal records" inset={SPACING.xs} />
            <Card>
              {recap.prs.length === 0 ? (
                <Text style={TYPE.footnote}>No PRs this month.</Text>
              ) : (
                recap.prs.map((e) => (
                  <View key={`${e.workoutId}-${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`} style={styles.prRow}>
                    <View style={styles.trophy}>
                      <Ionicons name="trophy" size={16} color={COLORS.accent} />
                    </View>
                    <View style={styles.prText}>
                      <Text style={TYPE.bodyStrong} numberOfLines={2}>
                        {e.exerciseName}
                      </Text>
                      <Text style={TYPE.footnote} numberOfLines={2}>
                        {`${PR_KIND_LABEL[e.kind]}${sideSuffix(e.side)} · ${formatPrValue(e.kind, e.value, e.unit, settings.weightUnit, e.reps)}`}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScreenScroll>

      {content ? (
        <StickyFooter>
          <Button title="Share recap" icon="share-outline" size="lg" fullWidth loading={sharing} onPress={share} />
        </StickyFooter>
      ) : null}

      {/* Mounted but off-screen so view-shot can capture it. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard
          ref={cardRef}
          title={`${month} recap`}
          subtitle={String(cursor.year)}
          kicker={`${month} ${cursor.year} recap`}
          hero={{ value: String(recap.workouts), label: recap.workouts === 1 ? 'workout' : 'workouts' }}
          stats={[
            { label: 'Active days', value: String(recap.activeDays) },
            { label: 'Total time', value: hoursLabel(recap.totalMinutes) },
            { label: 'PRs', value: String(recap.prs.length) },
            { label: 'Longest streak', value: `${recap.longestDailyStreak}d` },
          ]}
          footer={recap.topExercises.length ? `Top: ${recap.topExercises.map((e) => e.name).join(', ')}` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { alignItems: 'flex-start', paddingVertical: SPACING.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  tile: { width: '47.5%', flexGrow: 1 },
  tileCard: { minHeight: 96, justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  rank: { color: COLORS.accent, width: 24 },
  topName: { flex: 1 },
  sprintRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  sprintText: { flex: 1 },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  trophy: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prText: { flex: 1 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
