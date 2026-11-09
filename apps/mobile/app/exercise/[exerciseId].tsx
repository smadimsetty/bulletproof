// apps/mobile/app/exercise/[exerciseId].tsx
//
// Exercise detail: info + demo link, the user's current bests (per side), a
// chart of the exercise's primary metric (and ROM when logged), and recent
// sets grouped by workout. Reused by the library in Stage 2.
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import { DescriptionToggleButton, useToggle } from '../../components/DescriptionToggle';
import TrendLineChart from '../../components/progress/TrendLineChart';
import { fetchExerciseInfo, metricSeries, romSeries, type ExerciseInfo, type MetricPoint } from '../../lib/exerciseDetail';
import { fetchStatsDataset, type StatsExercise, type StatsWorkout } from '../../lib/stats/dataset';
import { computePrEvents, prKey, type PrKind } from '../../lib/stats/prs';
import { PR_KIND_LABEL, formatPrValue, shortDate, sideSuffix } from '../../lib/stats/format';
import { fetchUserSettings, DEFAULT_SETTINGS } from '../../lib/userSettings';
import { fieldsForExercise } from '../../lib/setFields';
import { formatSetLines } from '../../lib/setFormatting';
import { kgToDisplayUnit, type WeightUnit } from '../../lib/units';
import { deleteCustomExercise } from '../../lib/library';

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

function chartPoints(series: MetricPoint[], weightUnit: WeightUnit) {
  const conv = (n?: number, unit?: string) => (n === undefined ? undefined : unit === 'kg' ? Math.round(kgToDisplayUnit(n, weightUnit) * 10) / 10 : n);
  return series.map((p) => ({
    label: shortDate(p.date),
    a: p.value !== undefined ? conv(p.value, p.unit) : conv(p.left, p.unit),
    b: conv(p.right, p.unit),
  }));
}

export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ExerciseInfo | null>(null);
  const [workouts, setWorkouts] = useState<StatsWorkout[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_SETTINGS.weightUnit);
  const [descOpen, toggleDesc] = useToggle(false);

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
    const bestRows = bestKinds(info).flatMap((kind) =>
      sides.flatMap((side) => {
        const b = bests.get(prKey(info.id, side, kind));
        return b ? [`${PR_KIND_LABEL[kind]}${sideSuffix(side)}: ${formatPrValue(kind, b.value, kind === 'heaviest_weight' ? 'kg' : '', weightUnit)}`] : [];
      })
    );
    const rom = romSeries(workouts, info.id);
    const romBest = rom.reduce<Record<string, number>>((acc, p) => {
      for (const k of ['left', 'right', 'value'] as const) if (p[k] !== undefined) acc[k] = Math.max(acc[k] ?? -Infinity, p[k]!);
      return acc;
    }, {});
    return {
      bestRows,
      romBest,
      series: metricSeries(workouts, info.id),
      rom,
      recent: workouts.slice(-RECENT_WORKOUTS).reverse(),
    };
  }, [info, workouts, weightUnit]);

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (error || !info || !derived) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{error ?? 'Exercise not found.'}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={load}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  function confirmDelete() {
    Alert.alert('Delete exercise?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomExercise(info!.id);
            router.back();
          } catch (err: any) {
            // Includes the clear "used in your history" message for FK 23503.
            Alert.alert('Cannot delete', err?.message ?? 'Could not delete this exercise.');
          }
        },
      },
    ]);
  }

  const { kind } = fieldsForExercise({ exerciseType: info.exerciseType, unilateral: info.unilateral });
  const metricUnit = derived.series[0]?.unit;
  const romUnit = derived.rom[0]?.unit;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Stack.Screen options={{ title: info.name }} />
      <View style={sharedStyles.card}>
        <View style={styles.titleRow}>
          <Text style={[TYPE.screenTitle, styles.flex]}>{info.name}</Text>
          {info.description ? <DescriptionToggleButton open={descOpen} onToggle={toggleDesc} /> : null}
        </View>
        <View style={styles.chips}>
          {info.exerciseType && (
            <View style={sharedStyles.chip}>
              <Text style={sharedStyles.chipText}>{info.exerciseType.replace('_', ' ')}</Text>
            </View>
          )}
          {info.unilateral && (
            <View style={sharedStyles.chip}>
              <Text style={sharedStyles.chipText}>one side at a time</Text>
            </View>
          )}
        </View>
        {descOpen && info.description ? <Text style={TYPE.body}>{info.description}</Text> : null}
        {info.demoVideoUrl ? (
          <Pressable style={sharedStyles.primaryButton} onPress={() => WebBrowser.openBrowserAsync(info.demoVideoUrl!)}>
            <Text style={sharedStyles.primaryButtonText}>Watch demo</Text>
          </Pressable>
        ) : null}
        {info.isMine ? (
          <View style={styles.ownerActions}>
            <Pressable style={[sharedStyles.chip, styles.actionChip]} onPress={() => router.push(`/library/new?id=${info.id}`)}>
              <Text style={sharedStyles.chipText}>Edit</Text>
            </Pressable>
            <Pressable style={[sharedStyles.chip, styles.actionChip]} onPress={confirmDelete}>
              <Text style={[sharedStyles.chipText, styles.deleteText]}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {workouts.length === 0 ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.helperText}>You haven't logged this yet.</Text>
        </View>
      ) : (
        <>
          <View style={sharedStyles.card}>
            <Text style={TYPE.sectionTitle}>Current bests</Text>
            {derived.bestRows.map((r) => (
              <Text key={r} style={TYPE.body}>{r}</Text>
            ))}
            {Object.entries(derived.romBest).map(([k, v]) => (
              <Text key={k} style={TYPE.body}>
                Best ROM{k === 'left' ? ' (L)' : k === 'right' ? ' (R)' : ''}: {Math.round(v * 10) / 10} {romUnit}
              </Text>
            ))}
            {derived.bestRows.length === 0 && Object.keys(derived.romBest).length === 0 && (
              <Text style={sharedStyles.helperText}>No completed working sets yet.</Text>
            )}
          </View>

          {derived.series.length > 0 && (
            <View style={sharedStyles.card}>
              <Text style={TYPE.sectionTitle}>
                {kind === 'hold' || kind === 'duration' ? 'Hold time' : kind === 'reps' ? 'Reps' : 'Weight'} over time
                {metricUnit === 'kg' ? ` (${weightUnit})` : metricUnit === 's' ? ' (s)' : ''}
              </Text>
              <TrendLineChart points={chartPoints(derived.series, weightUnit)} twoSeries={info.unilateral} />
            </View>
          )}

          {derived.rom.length > 0 && (
            <View style={sharedStyles.card}>
              <Text style={TYPE.sectionTitle}>Range of motion ({romUnit})</Text>
              <TrendLineChart points={chartPoints(derived.rom, weightUnit)} twoSeries={info.unilateral} />
            </View>
          )}

          <View style={sharedStyles.card}>
            <Text style={TYPE.sectionTitle}>Recent sets</Text>
            {derived.recent.map((w) => {
              const ex = w.exercises.filter((e) => e.exerciseId === info.id);
              const lines = ex.flatMap((e) => formatSetLines(toFormattable(e), kind, weightUnit));
              return (
                <View key={w.id} style={styles.recentGroup}>
                  <Text style={TYPE.label}>{shortDate(w.endedAt)}</Text>
                  {lines.map((l, i) => (
                    <Text key={i} style={TYPE.body}>{l}</Text>
                  ))}
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  ownerActions: { flexDirection: 'row', gap: SPACING.sm },
  actionChip: { paddingHorizontal: SPACING.md },
  deleteText: { color: COLORS.danger },
  recentGroup: { gap: 2, paddingTop: SPACING.xs },
});
