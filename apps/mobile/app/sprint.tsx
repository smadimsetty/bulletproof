// apps/mobile/app/sprint.tsx
//
// Sprint flow (moved from the Home tab on 2026-11-07, see
// docs/superpowers/specs/2026-11-07-logger-history-design.md section 5).
// Day completion now happens by saving the day's workout in the logger.
// Pain-point picker -> baseline assessment -> active sprint day view (with
// swap) -> reassessment -> before/after summary -> back to the picker. Also
// carries the "Switch pain point" abandon escape hatch so the
// one-in-flight-sprint DB constraint never traps a user for the full 14+ days.
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING } from '../lib/theme';
import * as haptics from '../lib/haptics';
import {
  ConfirmSheet, EmptyState, ErrorState, ListRow, ScreenScroll, Sheet, SkeletonCard, SkeletonRow,
} from '../components/ui';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  fetchTodaySprintDay,
  fetchSwapCandidates,
  swapExercise,
  stepDownExercise,
  abandonSprint,
  continueSprint,
  type PainPoint,
  type Sprint,
  type SprintDay,
  type SprintDayExercise,
  type SwapCandidate,
} from '../lib/sprintLifecycle';
import {
  fetchAssessmentDefinitions,
  fetchAssessmentResults,
  fetchAssessmentHistory,
  prefillDraft,
  submitAssessment,
  buildBeforeAfterComparison,
  toEngineInputs,
  fetchRetestRecommendation,
  type AssessmentDefinition,
  type AssessmentResultInput,
  type AssessmentComparison,
} from '../lib/sprintAssessment';
import PainPointPicker from '../components/PainPointPicker';
import AssessmentForm from '../components/AssessmentForm';
import LastAssessmentSheet from '../components/LastAssessmentSheet';
import SprintDayChecklist from '../components/SprintDayChecklist';
import AssessmentSummary from '../components/AssessmentSummary';
import { pickRecommendation, recommendStayOrSwitch, type Recommendation } from '../lib/engine/retestRecommendation';
import { fetchActiveWorkout, startSprintWorkout, type ActiveWorkoutSummary } from '../lib/workouts';
import { handleStartResult } from '../lib/workoutStart';

/**
 * Non-initial failures (ticking a box, swapping, submitting) must never
 * replace the screen: AssessmentForm's draft lives inside that component,
 * so unmounting it on a dropped request throws away six hand-measured
 * values. Only the top-level load() gets to blank the screen. (The same
 * regression was fixed once before, on Settings, 2026-06-26.)
 */
function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

interface AssessmentPrefill {
  readonly draft: Map<string, AssessmentResultInput>;
  readonly from: string | null;
  readonly key?: string;
}

/**
 * Seed for the assessment form from the user's last completed assessment of
 * this pain point. A failure just means no prefill -- it must never block
 * the form.
 */
async function loadPrefill(
  painPointId: string,
  sprintId: string,
  phase: 'baseline' | 'reassessment',
  definitions: readonly AssessmentDefinition[]
): Promise<AssessmentPrefill> {
  try {
    const history = await fetchAssessmentHistory(painPointId, 1, { sprintId, phase });
    const last = history[0] ?? null;
    return { draft: prefillDraft(definitions, last), from: last?.completedAt ?? null };
  } catch {
    return { draft: new Map(), from: null };
  }
}

export default function SprintScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [definitions, setDefinitions] = useState<AssessmentDefinition[]>([]);
  const [prefill, setPrefill] = useState<AssessmentPrefill | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutSummary | null>(null);
  const [starting, setStarting] = useState(false);
  const [swapExerciseTarget, setSwapExerciseTarget] = useState<SprintDayExercise | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<ReadonlyArray<SwapCandidate>>([]);
  const [lastAssessmentOpen, setLastAssessmentOpen] = useState(false);
  const [comparisons, setComparisons] = useState<AssessmentComparison[] | null>(null);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [suggestedPainPointId, setSuggestedPainPointId] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const retestSprintRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const loadedRef = useRef(false);

  // 'initial' shows the full-screen spinner/error, 'refresh' (pull) shows the
  // refresh spinner and Alerts, 'focus' is silent. Only 'initial' ever sets
  // `loading` (see reportError above for why).
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else if (mode === 'initial') {
      setLoading(true);
    }
    try {
      const [pp, inFlight, active] = await Promise.all([fetchPainPoints(), fetchInFlightSprint(), fetchActiveWorkout()]);
      setPainPoints(pp);
      setActiveWorkout(active);
      setSprint(inFlight);
      setComparisons(null);

      if (inFlight && (inFlight.status === 'pending_baseline' || inFlight.status === 'pending_reassessment')) {
        const defs = await fetchAssessmentDefinitions(inFlight.painPointId);
        const phase = inFlight.status === 'pending_baseline' ? 'baseline' : 'reassessment';
        const key = `${inFlight.id}-${phase}`;
        const fresh = { ...(await loadPrefill(inFlight.painPointId, inFlight.id, phase, defs)), key };
        // A silent focus reload must not swap the seed under a form the user
        // is already typing into.
        setPrefill((prev) => (mode === 'focus' && prev?.key === key ? prev : fresh));
        setDefinitions(defs);
      }
      if (inFlight && inFlight.status === 'active') {
        setToday(await fetchTodaySprintDay(inFlight.id));
      }
      setLoadError(null);
      loadedRef.current = true;
    } catch (err: any) {
      if (mode === 'refresh') reportError(err, 'Could not refresh.');
      else if (mode === 'initial') setLoadError(err.message ?? 'Failed to load.');
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

  async function handleSelectPainPoint(painPoint: PainPoint) {
    setLoading(true);
    try {
      const newSprint = await beginSprint(painPoint.id);
      // Definitions first: showing the baseline form with an empty test
      // battery (which reads as "complete") would be worse than staying put.
      const defs = await fetchAssessmentDefinitions(painPoint.id);
      setPrefill(await loadPrefill(painPoint.id, newSprint.id, 'baseline', defs));
      setDefinitions(defs);
      setSprint(newSprint);
    } catch (err: any) {
      reportError(err, 'Could not start that sprint.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitBaseline(results: AssessmentResultInput[]) {
    if (!sprint) return;
    setSubmitting(true);
    try {
      await submitAssessment(sprint.id, 'baseline', results);
      await activateSprintAfterBaseline(sprint);
      haptics.success();
      await load();
    } catch (err: any) {
      reportError(err, 'Could not save your baseline.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitReassessment(results: AssessmentResultInput[]) {
    if (!sprint) return;
    setSubmitting(true);
    try {
      await submitAssessment(sprint.id, 'reassessment', results);
      const [baseline, reassessment] = await Promise.all([
        fetchAssessmentResults(sprint.id, 'baseline'),
        fetchAssessmentResults(sprint.id, 'reassessment'),
      ]);
      setComparisons(buildBeforeAfterComparison(definitions, baseline, reassessment));
      // Rules recommendation now; the coach's (if any) replaces it when it lands. One poll, never blocking.
      const engine = toEngineInputs(definitions, reassessment);
      const names = Object.fromEntries(definitions.map((d) => [d.testKey, d.name]));
      const rules = recommendStayOrSwitch(engine.tests, engine.results, names);
      setRecommendation(pickRecommendation(null, rules));
      const finishedId = sprint.id;
      retestSprintRef.current = finishedId;
      setTimeout(() => {
        fetchRetestRecommendation(finishedId)
          .then((ai) => {
            if (ai && retestSprintRef.current === finishedId) setRecommendation(pickRecommendation(ai, rules));
          })
          .catch(() => {});
      }, 5000);
      setSprint((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    } catch (err: any) {
      reportError(err, 'Could not save your reassessment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenSwap(exercise: SprintDayExercise) {
    if (!sprint) return;
    // Swapping a completed exercise would carry its completed_at onto a
    // different exercise; SprintDayChecklist already hides the action, this
    // is the matching guard on the handler itself.
    if (exercise.completedAt) return;
    try {
      const candidates = await fetchSwapCandidates(
        sprint.painPointId,
        exercise.slotKey,
        exercise.level,
        exercise.exerciseId,
        exercise.step ?? 1
      );
      setSwapCandidates(candidates);
      setSwapExerciseTarget(exercise);
    } catch (err: any) {
      reportError(err, 'Could not load swap options.');
    }
  }

  async function handleSelectSwap(candidate: SwapCandidate) {
    if (!swapExerciseTarget || !sprint) return;
    try {
      await swapExercise(
        swapExerciseTarget.id,
        swapExerciseTarget.exerciseId,
        candidate.exerciseId,
        candidate.prescribedSets,
        candidate.prescribedRepsOrDuration,
        candidate.level,
        candidate.step
      );
      setSwapExerciseTarget(null);
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      reportError(err, 'Could not swap that exercise.');
    }
  }

  async function handleStepDown() {
    if (!swapExerciseTarget || !sprint) return;
    try {
      await stepDownExercise(swapExerciseTarget.id, sprint.id, swapExerciseTarget.slotKey);
      setSwapExerciseTarget(null);
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      reportError(err, 'Could not switch to an easier version.');
    }
  }

  async function handleStay() {
    const finishedId = retestSprintRef.current;
    if (!finishedId) return;
    setContinuing(true);
    try {
      await continueSprint(finishedId);
      retestSprintRef.current = null;
      setRecommendation(null);
      haptics.success();
      await load();
    } catch (err: any) {
      reportError(err, 'Could not start another cycle.');
    } finally {
      setContinuing(false);
    }
  }

  function handlePickNewArea() {
    setSuggestedPainPointId(recommendation?.choice === 'switch' ? recommendation.suggestedPainPointId : null);
    retestSprintRef.current = null;
    setRecommendation(null);
    setSprint(null);
    setComparisons(null);
  }

  async function handleStartRoutine() {
    if (!today || !sprint) return;
    if (startingRef.current) return;
    const painPointName = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? 'Sprint';
    startingRef.current = true;
    setStarting(true);
    try {
      handleStartResult(await startSprintWorkout(today, painPointName), router);
    } catch (err: any) {
      reportError(err, "Could not start today's routine.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  // Opens the confirm sheet; the actual abandon happens in confirmAbandon.
  function handleAbandon() {
    if (!sprint) return;
    setAbandonOpen(true);
  }

  async function confirmAbandon() {
    if (!sprint) return;
    setAbandonOpen(false);
    try {
      await abandonSprint(sprint.id);
      await load();
    } catch (err: any) {
      reportError(err, 'Could not switch pain point.');
    }
  }

  const routineInProgress = !!activeWorkout && !!today && activeWorkout.sprintDayId === today.id;
  const abandonBody = routineInProgress
    ? "You'll lose this sprint's progress. Today's routine is still in progress: it will still save, as a plain workout, but won't count toward any sprint."
    : "You'll lose this sprint's progress.";

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Sprint' }} />
        <ScreenScroll>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonRow />
        </ScreenScroll>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Sprint' }} />
        <ErrorState style={styles.centered} message={loadError} onRetry={() => load()} />
      </View>
    );
  }

  if (comparisons) {
    return (
      <>
        <Stack.Screen options={{ title: 'Results' }} />
        <AssessmentSummary
          comparisons={comparisons}
          onDone={handlePickNewArea}
          recommendation={recommendation}
          painPointName={painPoints.find((p) => p.id === sprint?.painPointId)?.displayName}
          onStay={handleStay}
          busy={continuing}
        />
      </>
    );
  }

  if (!sprint) {
    return (
      <>
        <Stack.Screen options={{ title: 'Choose a pain point' }} />
        <PainPointPicker painPoints={painPoints} onSelect={handleSelectPainPoint} suggestedId={suggestedPainPointId} />
      </>
    );
  }

  if (sprint.status === 'pending_baseline') {
    return (
      <>
        <Stack.Screen options={{ title: 'Baseline' }} />
        <AssessmentForm
          key={`${sprint.id}-baseline`}
          title="Baseline assessment"
          phase="baseline"
          definitions={definitions}
          initialDraft={prefill?.draft}
          prefilledFrom={prefill?.from}
          submitting={submitting}
          onSubmit={handleSubmitBaseline}
        />
      </>
    );
  }

  if (sprint.status === 'pending_reassessment') {
    // Wording stays neutral about whether day 14 was actually ticked off: the
    // sprint also lands here purely by the calendar passing day 14, per the
    // design spec's "day 15 still triggers reassessment".
    return (
      <>
        <Stack.Screen options={{ title: 'Reassessment' }} />
        <AssessmentForm
          key={`${sprint.id}-reassessment`}
          title="Reassessment"
          phase="reassessment"
          definitions={definitions}
          initialDraft={prefill?.draft}
          prefilledFrom={prefill?.from}
          submitting={submitting}
          onSubmit={handleSubmitReassessment}
        />
      </>
    );
  }

  const painPointName = painPoints.find((p) => p.id === sprint.painPointId)?.displayName ?? null;
  const abandonSheet = (
    <ConfirmSheet
      visible={abandonOpen}
      onClose={() => setAbandonOpen(false)}
      title="Abandon this sprint?"
      body={abandonBody}
      confirmLabel="Switch pain point"
      destructive
      onConfirm={confirmAbandon}
    />
  );

  if (sprint.status === 'active' && today) {
    return (
      <>
        <SprintDayChecklist
          day={today}
          painPointName={painPointName}
          onOpenSwap={handleOpenSwap}
          onOpenLastAssessment={() => setLastAssessmentOpen(true)}
          onStartRoutine={handleStartRoutine}
          onAbandon={handleAbandon}
          starting={starting}
          routineInProgress={routineInProgress}
          dayComplete={!!today.completedAt}
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
        />
        <LastAssessmentSheet
          visible={lastAssessmentOpen}
          painPointId={sprint.painPointId}
          onClose={() => setLastAssessmentOpen(false)}
        />
        <Sheet
          visible={!!swapExerciseTarget}
          onClose={() => setSwapExerciseTarget(null)}
          title="Swap exercise"
          subtitle={swapExerciseTarget?.exerciseName}
        >
          {swapExerciseTarget?.level != null && !(swapExerciseTarget.level === 1 && (swapExerciseTarget.step ?? 1) === 1) && (
            <ListRow
              title="Easier version"
              subtitle="One step back on this exercise's progression"
              leading={{ icon: 'arrow-down-circle-outline' }}
              onPress={handleStepDown}
            />
          )}
          {swapCandidates.length === 0 && <EmptyState compact icon="swap-horizontal-outline" title="No alternatives at this level." />}
          {swapCandidates.map((c) => (
            <ListRow
              key={c.exerciseId}
              title={c.name}
              subtitle={
                c.prescribedSets || c.prescribedRepsOrDuration
                  ? `${c.prescribedSets ? `${c.prescribedSets} × ` : ''}${c.prescribedRepsOrDuration ?? ''}`
                  : undefined
              }
              onPress={() => handleSelectSwap(c)}
            />
          ))}
        </Sheet>
        {abandonSheet}
      </>
    );
  }

  // Reachable when an active sprint has no row for today's date -- e.g. the
  // device's clock drifted outside the generated 14-day window, or a past
  // partial activation. fetchInFlightSprint now moves a genuinely-finished
  // sprint to reassessment on its own, but this branch still has to offer a
  // real way out rather than asking for a pull-to-refresh that didn't exist.
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Sprint' }} />
      <EmptyState
        style={styles.centered}
        icon="calendar-outline"
        title="No routine scheduled today"
        body="This sprint doesn't have a session for today's date."
        action={{ label: 'Switch pain point', onPress: handleAbandon }}
      />
      {abandonSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignSelf: 'center', justifyContent: 'center', padding: SPACING.lg },
});
