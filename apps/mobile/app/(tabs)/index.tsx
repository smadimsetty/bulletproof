// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (mobility sprint pivot), complete: pain-point picker ->
// baseline assessment -> active sprint checklist (with swap + daily
// feedback) -> reassessment prompt -> reassessment form -> before/after
// summary -> back to the picker. Also carries the "Switch pain point"
// abandon escape hatch (design spec section 5) so the one-in-flight-sprint
// DB constraint never traps a user for the full 14+ days.
import { useCallback, useEffect, useState } from 'react';
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
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  fetchTodaySprintDay,
  completeExercise,
  completeDay,
  fetchSwapCandidates,
  swapExercise,
  submitDayFeedback,
  abandonSprint,
  type PainPoint,
  type Sprint,
  type SprintDay,
  type SprintDayExercise,
  type SwapCandidate,
} from '../../lib/sprintLifecycle';
import {
  fetchAssessmentDefinitions,
  fetchAssessmentResults,
  submitAssessment,
  buildBeforeAfterComparison,
  type AssessmentDefinition,
  type AssessmentResultInput,
  type AssessmentComparison,
} from '../../lib/sprintAssessment';
import PainPointPicker from '../../components/PainPointPicker';
import AssessmentForm from '../../components/AssessmentForm';
import SprintDayChecklist from '../../components/SprintDayChecklist';
import DayFeedbackSheet from '../../components/DayFeedbackSheet';
import AssessmentSummary from '../../components/AssessmentSummary';

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

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [definitions, setDefinitions] = useState<AssessmentDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [completingDay, setCompletingDay] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pendingCompleteDay, setPendingCompleteDay] = useState<SprintDay | null>(null);
  const [swapExerciseTarget, setSwapExerciseTarget] = useState<SprintDayExercise | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<ReadonlyArray<SwapCandidate>>([]);
  const [comparisons, setComparisons] = useState<AssessmentComparison[] | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [pp, inFlight] = await Promise.all([fetchPainPoints(), fetchInFlightSprint()]);
      setPainPoints(pp);
      setSprint(inFlight);
      setComparisons(null);

      if (inFlight && (inFlight.status === 'pending_baseline' || inFlight.status === 'pending_reassessment')) {
        setDefinitions(await fetchAssessmentDefinitions(inFlight.painPointId));
      }
      if (inFlight && inFlight.status === 'active') {
        setToday(await fetchTodaySprintDay(inFlight.id));
      }
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />
  );

  async function handleSelectPainPoint(painPoint: PainPoint) {
    setLoading(true);
    try {
      const newSprint = await beginSprint(painPoint.id);
      // Definitions first: showing the baseline form with an empty test
      // battery (which reads as "complete") would be worse than staying put.
      setDefinitions(await fetchAssessmentDefinitions(painPoint.id));
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

  async function handleToggleExercise(exercise: SprintDayExercise) {
    if (!today || !sprint) return;
    try {
      if (!exercise.completedAt) {
        await completeExercise(exercise.id);
      }
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      reportError(err, 'Could not update that exercise.');
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

  function handleCompleteDayPress() {
    if (!today) return;
    setPendingCompleteDay(today);
    setFeedbackOpen(true);
  }

  async function handleSubmitFeedback(reaction: 'good' | 'neutral' | 'hurt', note: string) {
    if (!pendingCompleteDay || !sprint) return;
    setCompletingDay(true);
    try {
      await submitDayFeedback(pendingCompleteDay.id, reaction, note);
      await completeDay(pendingCompleteDay.id, pendingCompleteDay.dayNumber, sprint.id);
      setFeedbackOpen(false);
      setPendingCompleteDay(null);
      await load();
    } catch (err: any) {
      reportError(err, 'Could not save today.');
    } finally {
      setCompletingDay(false);
    }
  }

  function handleAbandon() {
    if (!sprint) return;
    Alert.alert('Switch pain point?', "You'll lose this sprint's progress.", [
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
      <AssessmentForm title="Baseline assessment" definitions={definitions} submitting={submitting} onSubmit={handleSubmitBaseline} />
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
        <AssessmentForm title="Reassessment" definitions={definitions} submitting={submitting} onSubmit={handleSubmitReassessment} />
      </ScrollView>
    );
  }

  if (sprint.status === 'active' && today) {
    return (
      <>
        <SprintDayChecklist
          day={today}
          onToggleExercise={handleToggleExercise}
          onOpenSwap={handleOpenSwap}
          onCompleteDay={handleCompleteDayPress}
          onAbandon={handleAbandon}
          completingDay={completingDay}
          dayComplete={!!today.completedAt}
          refreshControl={refreshControl}
        />
        <DayFeedbackSheet
          visible={feedbackOpen}
          onSubmit={handleSubmitFeedback}
          onClose={() => setFeedbackOpen(false)}
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
