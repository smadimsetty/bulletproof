// apps/mobile/app/recap.tsx
//
// Monthly recap: stat tiles, PRs, top exercises, and a Share button that
// renders a branded card to an image. ?year=&month= (month is 0-based);
// defaults to last month.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING, TYPE, sharedStyles } from '../lib/theme';
import { fetchStatsDataset, type StatsWorkout } from '../lib/stats/dataset';
import { computePrEvents } from '../lib/stats/prs';
import { buildMonthlyRecap } from '../lib/stats/recap';
import { describePrEvent, monthName } from '../lib/stats/format';
import { fetchUserSettings, DEFAULT_SETTINGS, type UserSettings } from '../lib/userSettings';
import { shareViewAsImage } from '../lib/shareImage';
import ShareCard from '../components/share/ShareCard';

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

export default function RecapScreen() {
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
    setCursor((c) => {
      const d = new Date(c.year, c.month0 + delta, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });
  }

  async function share() {
    setSharing(true);
    try {
      await shareViewAsImage(cardRef, `${monthName(cursor.year, cursor.month0)} recap`);
    } catch (err: any) {
      Alert.alert('Could not share', err?.message ?? 'Something went wrong.');
    } finally {
      setSharing(false);
    }
  }

  const title = `${monthName(cursor.year, cursor.month0)} ${cursor.year}`;
  const tiles = [
    { label: 'Workouts', value: String(recap.workouts) },
    { label: 'Active days', value: String(recap.activeDays) },
    { label: 'Total time', value: hoursLabel(recap.totalMinutes) },
    { label: 'Longest streak', value: `${recap.longestDailyStreak}d` },
    { label: 'PRs', value: String(recap.prs.length) },
    { label: 'Sprint days', value: String(recap.sprintDaysLogged) },
  ];

  return (
    <>
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
        <View style={styles.switcher}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={COLORS.ink} />
          </Pressable>
          <Text style={TYPE.screenTitle}>{title}</Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} disabled={isCurrent} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={isCurrent ? COLORS.border : COLORS.ink} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : error ? (
          <View style={sharedStyles.card}>
            <Text style={TYPE.body}>{error}</Text>
            <Pressable style={sharedStyles.primaryButton} onPress={load}>
              <Text style={sharedStyles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {recap.workouts === 0 && <Text style={sharedStyles.helperText}>No finished workouts this month.</Text>}
            <View style={styles.tiles}>
              {tiles.map((t) => (
                <View key={t.label} style={[sharedStyles.card, styles.tile]}>
                  <Text style={styles.tileValue}>{t.value}</Text>
                  <Text style={sharedStyles.helperText}>{t.label}</Text>
                </View>
              ))}
            </View>

            <View style={sharedStyles.card}>
              <Text style={TYPE.sectionTitle}>Personal records</Text>
              {recap.prs.length === 0 ? (
                <Text style={sharedStyles.helperText}>No PRs this month.</Text>
              ) : (
                recap.prs.map((e) => (
                  <Text key={`${e.workoutId}-${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`} style={TYPE.body}>
                    {describePrEvent(e, settings.weightUnit)}
                  </Text>
                ))
              )}
            </View>

            <View style={sharedStyles.card}>
              <Text style={TYPE.sectionTitle}>Top exercises</Text>
              {recap.topExercises.length === 0 ? (
                <Text style={sharedStyles.helperText}>Nothing logged yet.</Text>
              ) : (
                recap.topExercises.map((e) => (
                  <Text key={e.name} style={TYPE.body}>
                    {e.name} · {e.sets} {e.sets === 1 ? 'set' : 'sets'}
                  </Text>
                ))
              )}
            </View>

            <Pressable style={[sharedStyles.primaryButton, sharing && { opacity: 0.6 }]} disabled={sharing} onPress={share}>
              <Text style={sharedStyles.primaryButtonText}>{sharing ? 'Preparing…' : 'Share'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Mounted but off-screen so view-shot can capture it. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard
          ref={cardRef}
          title={`${monthName(cursor.year, cursor.month0)} recap`}
          subtitle={String(cursor.year)}
          stats={[
            { label: 'Workouts', value: String(recap.workouts) },
            { label: 'Active days', value: String(recap.activeDays) },
            { label: 'Total time', value: hoursLabel(recap.totalMinutes) },
            { label: 'PRs', value: String(recap.prs.length) },
          ]}
          footer={recap.topExercises.length ? `Top: ${recap.topExercises.map((e) => e.name).join(', ')}` : undefined}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tile: { width: '48%', alignItems: 'flex-start' },
  tileValue: { fontSize: 26, fontWeight: '800', color: COLORS.accent },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
