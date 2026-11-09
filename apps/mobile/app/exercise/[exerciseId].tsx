// apps/mobile/app/exercise/[exerciseId].tsx
//
// Exercise detail (visual spec 4.11): info + demo link, the user's current bests (per
// side), a chart of the exercise's primary metric (and ROM when logged), and recent
// sets grouped by workout.
// TODO(stage4): spec's "+ Add to workout" footer (when a workout is active and the screen was
// opened from the library) and the PR trophy on recent sets need context/data this screen
// doesn't have; not added.
// TODO(stage4): spec says deleting an exercise used in history shows "in N workouts" in the
// sheet; deleteCustomExercise only surfaces that as an error message, so it stays a plain Alert.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { DescriptionBody, DescriptionToggleButton, useToggle } from '../../components/DescriptionToggle';
import { typeLabel } from '../../components/library/ExerciseListRow';
import { fetchExerciseInfo, metricSeries, romSeries, type ExerciseInfo, type MetricPoint } from '../../lib/exerciseDetail';
import { fetchStatsDataset, type StatsExercise, type StatsWorkout } from '../../lib/stats/dataset';
import { computePrEvents, prKey, type PrKind } from '../../lib/stats/prs';
import { PR_KIND_LABEL, formatPrValue, shortDate, sideSuffix } from '../../lib/stats/format';
import { fetchUserSettings, DEFAULT_SETTINGS } from '../../lib/userSettings';
import { fieldsForExercise } from '../../lib/setFields';
import { formatSetLines } from '../../lib/setFormatting';
import { kgToDisplayUnit, type WeightUnit } from '../../lib/units';
import { deleteCustomExercise } from '../../lib/library';
import {
  ActionSheet, Button, Card, Chip, ConfirmSheet, EmptyState, ErrorState, IconButton, LineChartCard, ScreenScroll, SectionHeader,
  Skeleton, SkeletonCard, Stat, type ChartSeries,
} from '../../components/ui';

const RECENT_WORKOUTS = 10;

function bestKinds(info: ExerciseInfo): PrKind[] {
  const { kind } = fieldsForExercise({ exerciseType: info.exerciseType, unilateral: info.unilateral });
  return [kind === 'hold' || kind === 'duration' ? 'longest_hold' : kind === 'reps' ? 'most_reps' : 'heaviest_weight'];
}

/** Rebuilds set numbers (not kept in the dataset): per side for sided sets. */
function toFormattable(ex: StatsExercise) {
  const counters = new Map<string, number>();
  return ex.sets.map((s) => {
    const k = s.side ?? '-';
    const n = (counters.get(k) ?? 0) + 1;
    counters.set(k, n);
    return {
      setNumber: n,
      side: s.side,
      setType: s.setType,
      reps: s.reps,
      weightKg: s.weightKg,
      durationS: s.durationS,
      romValue: s.romValue,
      romUnit: s.romUnit,
    };
  });
}

/** L/R (or single) chart series; a side with no data is dropped rather than drawn as zero. */
function chartSeries(series: MetricPoint[], weightUnit: WeightUnit, sided: boolean): ChartSeries[] {
  const conv = (n?: number, unit?: string) => (n === undefined ? undefined : unit === 'kg' ? Math.round(kgToDisplayUnit(n, weightUnit) * 10) / 10 : n);
  const pick = (get: (p: MetricPoint) => number | undefined) =>
    series.flatMap((p) => {
      const v = conv(get(p), p.unit);
      return v === undefined ? [] : [{ value: v, label: shortDate(p.date) }];
    });
  if (sided) {
    return [
      { name: 'L', color: COLORS.chartLeft, data: pick((p) => p.left) },
      { name: 'R', color: COLORS.chartRight, data: pick((p) => p.right) },
    ].filter((s) => s.data.length > 0);
  }
  return [{ color: COLORS.accent, data: pick((p) => p.value ?? p.left) }];
}

interface BestTile {
  key: string;
  label: string;
  value: string;
  side: 'left' | 'right' | null;
}

export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ExerciseInfo | null>(null);
  const [workouts, setWorkouts] = useState<StatsWorkout[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_SETTINGS.weightUnit);
  const [descOpen, toggleDesc] = useToggle(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const [i, w, s] = await Promise.all([
        fetchExerciseInfo(exerciseId),
        fetchStatsDataset({ exerciseIds: [exerciseId] }),
        fetchUserSettings(),
      ]);
      setInfo(i);
      setWorkouts(w);
      setWeightUnit(s.weightUnit);
      setError(null);
      loadedOnce.current = true;
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load exercise.');
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);
  // Reload on every focus so edits made elsewhere show on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const derived = useMemo(() => {
    if (!info) return null;
    const bests = computePrEvents(workouts).bests;
    const sides = info.unilateral ? (['left', 'right'] as const) : ([null] as const);
    const bestTiles: BestTile[] = bestKinds(info).flatMap((kind) =>
      sides.flatMap((side) => {
        const b = bests.get(prKey(info.id, side, kind));
        return b
          ? [{
              key: `${kind}-${side ?? '-'}`,
              label: `${PR_KIND_LABEL[kind]}${sideSuffix(side)}`,
              value: formatPrValue(kind, b.value, kind === 'heaviest_weight' ? 'kg' : '', weightUnit),
              side,
            }]
          : [];
      })
    );
    const rom = romSeries(workouts, info.id);
    const romBest = rom.reduce<Record<string, number>>((acc, p) => {
      for (const k of ['left', 'right', 'value'] as const) if (p[k] !== undefined) acc[k] = Math.max(acc[k] ?? -Infinity, p[k]!);
      return acc;
    }, {});
    return {
      bestTiles,
      romBest,
      series: metricSeries(workouts, info.id),
      rom,
      recent: workouts.slice(-RECENT_WORKOUTS).reverse(),
    };
  }, [info, workouts, weightUnit]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: '' }} />
        <ScreenScroll>
          <Skeleton width="60%" height={34} />
          <SkeletonCard />
          <SkeletonCard />
        </ScreenScroll>
      </View>
    );
  }
  if (error || !info || !derived) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: '' }} />
        <ScreenScroll>
          <ErrorState message={error ?? 'Exercise not found.'} retrying={retrying} onRetry={retry} />
        </ScreenScroll>
      </View>
    );
  }

  async function doDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deleteCustomExercise(info!.id);
      setConfirmOpen(false);
      haptics.success();
      router.back();
    } catch (err: any) {
      setConfirmOpen(false);
      haptics.error();
      // Includes the clear "used in your history" message for FK 23503.
      Alert.alert('Cannot delete', err?.message ?? 'Could not delete this exercise.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const { kind } = fieldsForExercise({ exerciseType: info.exerciseType, unilateral: info.unilateral });
  const metricUnit = derived.series[0]?.unit;
  const romUnit = derived.rom[0]?.unit;
  const metricTitle = `${kind === 'hold' || kind === 'duration' ? 'Hold time' : kind === 'reps' ? 'Reps' : 'Weight'} over time${
    metricUnit === 'kg' ? ` (${weightUnit})` : metricUnit === 's' ? ' (s)' : ''
  }`;
  const romEntries = Object.entries(derived.romBest);
  const hasBests = derived.bestTiles.length > 0 || romEntries.length > 0;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: info.isMine
            ? () => <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="Exercise options" onPress={() => setMenuOpen(true)} />
            : undefined,
        }}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <Text style={TYPE.title1}>{info.name}</Text>
        <View style={styles.chips}>
          {info.exerciseType ? <Chip label={typeLabel(info.exerciseType) || info.exerciseType.replace('_', ' ')} tone="accent" /> : null}
          {info.unilateral ? <Chip label="Unilateral" /> : null}
          {info.bodyParts.map((b) => (
            <Chip key={b} label={b} />
          ))}
        </View>

        {info.description ? (
          <View>
            <View style={styles.descHead}>
              <Text style={TYPE.title3}>Description</Text>
              <DescriptionToggleButton open={descOpen} onToggle={toggleDesc} />
            </View>
            <DescriptionBody open={descOpen} text={info.description} />
          </View>
        ) : null}

        {info.demoVideoUrl ? (
          <Button title="Watch demo" icon="play-circle" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(info.demoVideoUrl!)} />
        ) : null}

        {workouts.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon="stats-chart-outline"
              title="You haven't logged this yet"
              body="Add it to a workout to start tracking bests."
            />
          </Card>
        ) : (
          <>
            <SectionHeader title="Your bests" inset={SPACING.xs} />
            {hasBests ? (
              <View style={styles.tiles}>
                {derived.bestTiles.map((t) => (
                  <Card key={t.key} padding={14} style={[styles.tile, tileAccent(t.side)]}>
                    <Stat size="md" label={t.label} value={t.value} animate={false} />
                  </Card>
                ))}
                {romEntries.map(([k, v]) => (
                  <Card key={k} padding={14} style={[styles.tile, tileAccent(k === 'left' ? 'left' : k === 'right' ? 'right' : null)]}>
                    <Stat
                      size="md"
                      label={`Best ROM${k === 'left' ? ' (L)' : k === 'right' ? ' (R)' : ''}`}
                      value={`${Math.round(v * 10) / 10} ${romUnit ?? ''}`.trim()}
                      animate={false}
                    />
                  </Card>
                ))}
              </View>
            ) : (
              <Text style={TYPE.footnote}>No completed working sets yet.</Text>
            )}

            {derived.series.length > 0 ? (
              <>
                <SectionHeader title="Trend" inset={SPACING.xs} />
                <LineChartCard title={metricTitle} series={chartSeries(derived.series, weightUnit, info.unilateral)} />
              </>
            ) : null}

            {derived.rom.length > 0 ? (
              <LineChartCard title={`Range of motion (${romUnit})`} series={chartSeries(derived.rom, weightUnit, info.unilateral)} />
            ) : null}

            <SectionHeader title="Recent" inset={SPACING.xs} />
            {derived.recent.map((w) => {
              const ex = w.exercises.filter((e) => e.exerciseId === info.id);
              const lines = ex.flatMap((e) => formatSetLines(toFormattable(e), kind, weightUnit));
              return (
                <Card key={w.id} onPress={() => router.push(`/workout-summary/${w.id}`)} accessibilityLabel={`${w.title}, ${shortDate(w.endedAt)}`}>
                  <Text style={TYPE.bodyStrong} numberOfLines={2}>
                    {`${shortDate(w.endedAt)} · ${w.title}`}
                  </Text>
                  <Text style={[TYPE.callout, styles.sets]}>{lines.join(' · ')}</Text>
                </Card>
              );
            })}
          </>
        )}
      </ScreenScroll>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: 'Edit', icon: 'create-outline', onPress: () => router.push(`/library/new?id=${info.id}`) },
          { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => setConfirmOpen(true) },
        ]}
      />
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete exercise?"
        body="This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={doDelete}
      />
    </View>
  );
}

function tileAccent(side: 'left' | 'right' | null) {
  if (side === 'left') return { borderLeftWidth: 3, borderLeftColor: COLORS.chartLeft };
  if (side === 'right') return { borderLeftWidth: 3, borderLeftColor: COLORS.chartRight };
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  descHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: SPACING.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 96, justifyContent: 'center' },
  sets: { fontVariant: ['tabular-nums'] },
});
