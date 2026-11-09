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
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  fetchTodaySprintDay,
  fetchSwapCandidates,
  swapExercise,
  abandonSprint,
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
  type AssessmentDefinition,
  type AssessmentResultInput,
  type AssessmentComparison,
} from '../lib/sprintAssessment';
import PainPointPicker from '../components/PainPointPicker';
import AssessmentForm from '../components/AssessmentForm';
import LastAssessmentSheet from '../components/LastAssessmentSheet';
import SprintDayChecklist from '../components/SprintDayChecklist';
import AssessmentSummary from '../components/AssessmentSummary';
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

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />
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
      const candidates = await fetchSwapCandidates(sprint.painPointId, exercise.slotKey, exercise.exerciseId);
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
        candidate.prescribedRepsOrDuration
      );
      setSwapExerciseTarget(null);
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      reportError(err, 'Could not swap that exercise.');
    }
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

  function handleAbandon() {
    if (!sprint) return;
    const routineInProgress = !!activeWorkout && !!today && activeWorkout.sprintDayId === today.id;
    const message = routineInProgress
      ? "You'll lose this sprint's progress. Today's routine is still in progress: it will still save, as a plain workout, but won't count toward any sprint."
      : "You'll lose this sprint's progress.";
    Alert.alert('Switch pain point?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch',
        style: 'destructive',
        onPress: async () => {
          try {
            await abandonSprint(sprint.id);
            await load();
          } catch (err: any) {
            reportError(err, 'Could not switch pain point.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={[sharedStyles.primaryButton, styles.retryButton]} onPress={() => load()}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (comparisons) {
    return <AssessmentSummary comparisons={comparisons} onDone={() => { setSprint(null); setComparisons(null); }} />;
  }

  if (!sprint) {
    return <PainPointPicker painPoints={painPoints} onSelect={handleSelectPainPoint} />;
  }

  if (sprint.status === 'pending_baseline') {
    return (
      <AssessmentForm
        key={`${sprint.id}-baseline`}
        title="Baseline assessment"
        definitions={definitions}
        initialDraft={prefill?.draft}
        prefilledFrom={prefill?.from}
        submitting={submitting}
        onSubmit={handleSubmitBaseline}
      />
    );
  }

  if (sprint.status === 'pending_reassessment') {
    return (
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
        <View style={sharedStyles.card}>
          {/* Wording stays neutral about whether day 14 was actually ticked
              off: the sprint also lands here purely by the calendar passing
              day 14, per the design spec's "day 15 still triggers
              reassessment". */}
          <Text style={sharedStyles.sectionTitle}>Your 14 days are up — time to reassess</Text>
        </View>
        <AssessmentForm
          key={`${sprint.id}-reassessment`}
          title="Reassessment"
          definitions={definitions}
          initialDraft={prefill?.draft}
          prefilledFrom={prefill?.from}
          submitting={submitting}
          onSubmit={handleSubmitReassessment}
        />
      </ScrollView>
    );
  }

  if (sprint.status === 'active' && today) {
    return (
      <>
        <SprintDayChecklist
          day={today}
          onOpenSwap={handleOpenSwap}
          onOpenLastAssessment={() => setLastAssessmentOpen(true)}
          onStartRoutine={handleStartRoutine}
          onAbandon={handleAbandon}
          starting={starting}
          routineInProgress={!!activeWorkout && activeWorkout.sprintDayId === today.id}
          dayComplete={!!today.completedAt}
          refreshControl={refreshControl}
        />
        <LastAssessmentSheet
          visible={lastAssessmentOpen}
          painPointId={sprint.painPointId}
          onClose={() => setLastAssessmentOpen(false)}
        />
        <Modal visible={!!swapExerciseTarget} animationType="slide" transparent onRequestClose={() => setSwapExerciseTarget(null)}>
          <Pressable style={styles.backdrop} onPress={() => setSwapExerciseTarget(null)}>
            <View style={styles.swapSheet}>
              <Text style={sharedStyles.sectionTitle}>Swap exercise</Text>
              {swapCandidates.length === 0 && (
                <Text style={sharedStyles.helperText}>No alternatives for this slot yet.</Text>
              )}
              {swapCandidates.map((c) => (
                <Pressable key={c.exerciseId} style={styles.swapOptionRow} onPress={() => handleSelectSwap(c)}>
                  <Text style={TYPE.body}>{c.name}</Text>
                  {(c.prescribedSets || c.prescribedRepsOrDuration) && (
                    <Text style={sharedStyles.helperText}>
                      {c.prescribedSets ? `${c.prescribedSets} x ` : ''}
                      {c.prescribedRepsOrDuration ?? ''}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </>
    );
  }

  // Reachable when an active sprint has no row for today's date -- e.g. the
  // device's clock drifted outside the generated 14-day window, or a past
  // partial activation. fetchInFlightSprint now moves a genuinely-finished
  // sprint to reassessment on its own, but this branch still has to offer a
  // real way out rather than asking for a pull-to-refresh that didn't exist.
  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={[sharedStyles.screenContent, styles.fallbackContent]}
      refreshControl={refreshControl}
    >
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>No routine for today</Text>
        <Text style={sharedStyles.helperText}>
          This sprint doesn't have a session scheduled for today. Pull down to refresh, or switch to a different pain
          point to start fresh.
        </Text>
        <Pressable style={sharedStyles.primaryButton} onPress={handleAbandon}>
          <Text style={sharedStyles.primaryButtonText}>Switch pain point</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  retryButton: { alignSelf: 'center', paddingHorizontal: SPACING.lg },
  fallbackContent: { flexGrow: 1, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  swapSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8 },
  swapOptionRow: { paddingVertical: 12 },
});
