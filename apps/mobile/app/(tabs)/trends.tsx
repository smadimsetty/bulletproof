// Trends screen (Phase 7): time-range selector, a deterministic summary
// card, the sleep/training overlay chart, and the muscle-group volume
// chart with its tap-to-drill-down best-lifts sheet. See
// docs/superpowers/specs/2026-06-25-trends-design.md for the
// implementation decisions (charting library choice, the deterministic-
// summary call, time-range/volume-bucketing semantics).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../../lib/theme';
import { dateRangeBounds, type TimeRange } from '../../lib/trendsRange';
import { fetchSleepAndTrainingHistory, type HistoryPoint } from '../../lib/trendsHistory';
import {
  fetchMuscleGroupLogs,
  aggregateWeeklyVolumeByBodyPart,
  totalVolumeByBodyPart,
  rankBestLifts,
  type MuscleGroupLogRow,
} from '../../lib/muscleGroupVolume';
import { buildTrendsSummary } from '../../lib/trendsSummary';
import TimeRangeSelector from '../../components/TimeRangeSelector';
import TrendsSummaryCard from '../../components/TrendsSummaryCard';
import SleepTrainingChart from '../../components/SleepTrainingChart';
import MuscleGroupVolumeChart from '../../components/MuscleGroupVolumeChart';
import BestLiftsSheet from '../../components/BestLiftsSheet';

export default function Trends() {
  const [range, setRange] = useState<TimeRange>('month');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [muscleGroupLogs, setMuscleGroupLogs] = useState<MuscleGroupLogRow[]>([]);
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const bounds = dateRangeBounds(range, new Date());
      const [historyResult, logsResult] = await Promise.all([
        fetchSleepAndTrainingHistory(bounds),
        fetchMuscleGroupLogs(bounds),
      ]);
      setHistory(historyResult);
      setMuscleGroupLogs(logsResult);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load trends.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={TYPE.body}>Loading trends…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>Couldn't load trends: {loadError}</Text>
      </View>
    );
  }

  const weeklyVolume = aggregateWeeklyVolumeByBodyPart(muscleGroupLogs);
  const volumeTotals = totalVolumeByBodyPart(weeklyVolume);
  const summary = buildTrendsSummary({ range, history, weeklyVolume });
  const bestLifts = selectedBodyPart ? rankBestLifts(muscleGroupLogs, selectedBodyPart) : [];

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Trends</Text>
      <TimeRangeSelector value={range} onSelect={setRange} />
      <TrendsSummaryCard loading={false} summary={summary} />
      <SleepTrainingChart history={history} />
      <MuscleGroupVolumeChart totals={volumeTotals} onBarPress={setSelectedBodyPart} />
      <BestLiftsSheet
        visible={selectedBodyPart != null}
        bodyPart={selectedBodyPart}
        entries={bestLifts}
        onClose={() => setSelectedBodyPart(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: 8 },
});
