// apps/mobile/app/(tabs)/index.tsx
//
// Training tab (visual spec 4.3): in-progress card or "Start empty workout",
// the sprint card and routines. Past workouts live in History and Profile.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import {
  fetchActiveWorkout, startSprintWorkout, startWorkout, subscribeToActiveWorkoutChanges,
  type ActiveWorkoutSummary,
} from '../../lib/workouts';
import { fetchRoutinesAndFolders, startRoutineWorkout, type Routine, type RoutineFolder } from '../../lib/routines';
import {
  fetchInFlightSprint, switchSprint, fetchPainPoints, fetchTodaySprintDay,
  type PainPoint, type Sprint, type SprintDay,
} from '../../lib/sprintLifecycle';
import { startOneOffWorkout } from '../../lib/focusSwap';
import ChangeFocusSheet from '../../components/ChangeFocusSheet';
import { defaultWorkoutTitle } from '../../lib/workoutTitles';
import { handleStartResult } from '../../lib/workoutStart';
import EquipmentTierPicker from '../../components/EquipmentTierPicker';
import TimeRangePicker from '../../components/TimeRangePicker';
import type { TimeRange } from '../../lib/engine/dayPlanner';
import { fetchUserSettings, updateUserSettings } from '../../lib/userSettings';
import { refitInFlightSprintToTier } from '../../lib/sprintTierRefit';
import type { EquipmentTier } from '../../lib/equipmentTiers';
import SprintCard from '../../components/SprintCard';
import RoutinesSection from '../../components/routines/RoutinesSection';
import { fetchHangs, formatHangDuration, hangStats } from '../../lib/hangs';
import {
  Button, Card, CompactHeaderBar, ErrorState, IconButton, LargeHeader, ScreenScroll,
  SkeletonCard, SkeletonRow, Sheet, useScreenScroll,
} from '../../components/ui';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function WorkoutTab() {
  const router = useRouter();
  const scrollY = useScreenScroll();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveWorkoutSummary | null>(null);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [folders, setFolders] = useState<RoutineFolder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [hangTodayMs, setHangTodayMs] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [changeFocusOpen, setChangeFocusOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Synchronous guard: two taps can land before `starting` re-renders.
  const startingRef = useRef(false);
  // A fast double tap would push two logger screens.
  const lastPushRef = useRef(0);
  const loadedRef = useRef(false);
  // One-time equipment prompt: shown when settings loaded with no tier chosen yet.
  const [tierPromptOpen, setTierPromptOpen] = useState(false);
  const tierPromptShownRef = useRef(false);
  // One-time daily-time prompt: after the tier prompt is resolved, never alongside it.
  const [timePromptOpen, setTimePromptOpen] = useState(false);
  const timePromptShownRef = useRef(false);
  const timePromptPendingRef = useRef(false);

  // 'initial' blanks to an error screen on failure, 'refresh' (pull) shows the
  // spinner and Alerts, 'focus' (tab focus / change events) is silent.
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [a, s, pp, rf] = await Promise.all([
        fetchActiveWorkout(),
        fetchInFlightSprint(),
        fetchPainPoints(),
        // Routines are secondary: a failure here must not blank the whole tab.
        fetchRoutinesAndFolders().catch(() => null),
      ]);
      // Secondary, like routines: the hang card just hides its total on failure.
      fetchHangs(100)
        .then((h) => setHangTodayMs(hangStats(h, new Date()).todayMs))
        .catch(() => setHangTodayMs(null));
      if (rf) {
        setFolders(rf.folders);
        setRoutines(rf.routines);
      }
      setActive(a);
      setSprint(s);
      setPainPoints(pp);
      setToday(s && s.status === 'active' ? await fetchTodaySprintDay(s.id) : null);
      setLoadError(null);
      loadedRef.current = true;
      if (!tierPromptShownRef.current || !timePromptShownRef.current) {
        // Secondary: a settings failure must not affect the tab. The tabs only mount once
        // onboarding is done, so a null tier here means an existing user.
        const settings = await fetchUserSettings().catch(() => null);
        if (settings && settings.equipmentTier === null && !tierPromptShownRef.current) {
          tierPromptShownRef.current = true;
          // The time prompt follows once the tier is chosen.
          timePromptPendingRef.current = settings.dailyTimeRange === null;
          setTierPromptOpen(true);
        } else if (settings && settings.equipmentTier !== null && settings.dailyTimeRange === null && !timePromptShownRef.current) {
          timePromptShownRef.current = true;
          setTimePromptOpen(true);
        }
      }
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

  async function handleSelectTier(tier: EquipmentTier) {
    setTierPromptOpen(false);
    try {
      await updateUserSettings({ equipmentTier: tier });
    } catch (err) {
      reportError(err, 'Could not save your equipment.');
      return;
    }
    if (timePromptPendingRef.current && !timePromptShownRef.current) {
      timePromptShownRef.current = true;
      setTimePromptOpen(true);
    }
    // The running sprint predates the tier; best effort, the next sprint uses it regardless.
    try {
      if ((await refitInFlightSprintToTier(tier)) > 0) await load('focus');
    } catch {
      // Not worth interrupting the user over.
    }
  }

  async function handleSelectTimeRange(range: TimeRange) {
    setTimePromptOpen(false);
    try {
      await updateUserSettings({ dailyTimeRange: range });
    } catch (err) {
      reportError(err, 'Could not save your daily time.');
    }
  }

  async function handleStartEmpty() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      handleStartResult(await startWorkout({ source: 'empty', title: defaultWorkoutTitle(new Date()) }), router);
    } catch (err) {
      reportError(err, 'Could not start a workout.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleStartSavedRoutine(routine: Routine) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const result = await startRoutineWorkout(routine);
      handleStartResult(result, router);
      if (result.ok && result.skipped && result.skipped.length > 0) {
        Alert.alert('Some exercises were skipped', `These no longer exist: ${result.skipped.join(', ')}.`);
      }
    } catch (err) {
      reportError(err, 'Could not start this routine.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleJustToday(painPoint: PainPoint) {
    if (!today || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const result = await startOneOffWorkout(painPoint.id, painPoint.displayName, today.dayNumber);
      setChangeFocusOpen(false);
      handleStartResult(result, router);
    } catch (err) {
      reportError(err, 'Could not start that routine.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleStartNewSprint(painPoint: PainPoint) {
    if (!sprint || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      await switchSprint(sprint.id, painPoint.id);
      setChangeFocusOpen(false);
      await load('focus');
      router.push('/sprint');
    } catch (err) {
      reportError(err, 'Could not start a new sprint.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function handleStartRoutine() {
    if (!today || !sprint) return;
    if (startingRef.current) return;
    const name = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
    startingRef.current = true;
    setStarting(true);
    try {
      handleStartResult(await startSprintWorkout(today, name), router);
    } catch (err) {
      reportError(err, "Could not start today's routine.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  const header = (
    <LargeHeader
      title="Training"
      actions={<IconButton icon="library-outline" accessibilityLabel="Exercise library" onPress={() => router.push('/library')} />}
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {header}
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ScreenScroll>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
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
        </ScreenScroll>
      </View>
    );
  }

  const painPointName = sprint ? painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? null : null;

  return (
    <View style={styles.root}>
      <ScreenScroll
        scrollY={scrollY}
        refreshing={refreshing}
        onRefresh={() => load('refresh')}
        // Leave room for the docked active-workout banner.
        contentContainerStyle={active ? styles.withBanner : undefined}
      >
        {header}
        {active ? (
          <Card variant="accent" onPress={() => {
              const t = Date.now();
              if (t - lastPushRef.current < 1000) return;
              lastPushRef.current = t;
              router.push(`/workout/${active.id}`);
            }} accessibilityLabel={`Resume ${active.title}`}>
            <View style={styles.activeRow}>
              <Ionicons name="radio-button-on" size={14} color={COLORS.accent} />
              <Text style={[TYPE.bodyStrong, styles.activeTitle]} numberOfLines={1}>
                {active.title}
              </Text>
              <Text style={styles.resume}>Resume</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.accent} />
            </View>
          </Card>
        ) : null}
        <SprintCard
          sprint={sprint}
          painPointName={painPointName}
          today={today}
          activeWorkout={active}
          starting={starting}
          onStartRoutine={handleStartRoutine}
          onOpenSprint={() => router.push('/sprint')}
          onChangeFocus={painPoints.length > 1 ? () => setChangeFocusOpen(true) : undefined}
        />
        {active ? null : (
          <Button title="Start empty workout" icon="add" variant="secondary" size="lg" fullWidth loading={starting} onPress={handleStartEmpty} />
        )}
        <Card onPress={() => router.push('/hang')} accessibilityLabel="Open the dead hang timer">
          <View style={styles.activeRow}>
            <View style={styles.hangIcon}>
              <Ionicons name="timer-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={styles.activeTitle}>
              <Text style={TYPE.bodyStrong}>Dead hang timer</Text>
              <Text style={TYPE.footnote}>
                {hangTodayMs ? `Today ${formatHangDuration(hangTodayMs)}` : 'Hang any time. It all stacks up.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
          </View>
        </Card>
        <RoutinesSection folders={folders} routines={routines} starting={starting || !!active} onStart={handleStartSavedRoutine} onChanged={() => load('focus')} />
      </ScreenScroll>
      <CompactHeaderBar title="Training" scrollY={scrollY} />
      <ChangeFocusSheet
        visible={changeFocusOpen}
        onClose={() => setChangeFocusOpen(false)}
        sprintName={painPointName ?? 'sprint'}
        painPoints={painPoints.filter((p) => p.id !== sprint?.painPointId)}
        busy={starting}
        onJustToday={handleJustToday}
        onStartNewSprint={handleStartNewSprint}
      />
      <Sheet
        visible={tierPromptOpen}
        onClose={() => setTierPromptOpen(false)}
        title="What do you have to train with?"
        subtitle="Sprint routines only use exercises you can do with this. Change it any time in Settings."
      >
        <View style={styles.sheetBody}>
          <EquipmentTierPicker value={null} onSelect={handleSelectTier} />
        </View>
      </Sheet>
      <Sheet
        visible={timePromptOpen}
        onClose={() => setTimePromptOpen(false)}
        title="How much time a day?"
        subtitle="We'll fit each day's routine into this. You can change it in Settings."
      >
        <View style={styles.sheetBody}>
          <TimeRangePicker value={null} onSelect={handleSelectTimeRange} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  sheetBody: { paddingVertical: SPACING.lg },
  withBanner: { paddingBottom: 76 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  activeTitle: { flex: 1 },
  hangIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accentTint, alignItems: 'center', justifyContent: 'center' },
  resume: { ...TYPE.callout, color: COLORS.accent, fontWeight: '700' },
});
