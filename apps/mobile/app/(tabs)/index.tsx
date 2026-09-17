// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (mobility sprint pivot): pain-point picker -> baseline
// assessment -> active sprint -> reassessment -> before/after summary,
// back to the picker. Replaces the old Oura-driven daily recommendation
// screen entirely. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// section 5 for the full state machine this implements. Task 11 fills in
// the 'active'/'pending_reassessment'/'completed' branches -- this task
// only wires 'no sprint' and 'pending_baseline'.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  type PainPoint,
  type Sprint,
} from '../../lib/sprintLifecycle';
import {
  fetchAssessmentDefinitions,
  submitAssessment,
  type AssessmentDefinition,
  type AssessmentResultInput,
} from '../../lib/sprintAssessment';
import PainPointPicker from '../../components/PainPointPicker';
import AssessmentForm from '../../components/AssessmentForm';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [definitions, setDefinitions] = useState<AssessmentDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pp, inFlight] = await Promise.all([fetchPainPoints(), fetchInFlightSprint()]);
      setPainPoints(pp);
      setSprint(inFlight);
      if (inFlight && inFlight.status === 'pending_baseline') {
        setDefinitions(await fetchAssessmentDefinitions(inFlight.painPointId));
      }
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectPainPoint(painPoint: PainPoint) {
    setLoading(true);
    try {
      const newSprint = await beginSprint(painPoint.id);
      setSprint(newSprint);
      setDefinitions(await fetchAssessmentDefinitions(painPoint.id));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not start that sprint.');
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
      setLoadError(err.message ?? 'Could not save your baseline.');
    } finally {
      setSubmitting(false);
    }
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
      </View>
    );
  }

  if (!sprint) {
    return <PainPointPicker painPoints={painPoints} onSelect={handleSelectPainPoint} />;
  }

  if (sprint.status === 'pending_baseline') {
    return (
      <AssessmentForm
        title="Baseline assessment"
        definitions={definitions}
        submitting={submitting}
        onSubmit={handleSubmitBaseline}
      />
    );
  }

  // 'active' / 'pending_reassessment' / 'completed' land here until Task 11.
  return (
    <View style={[sharedStyles.screen, styles.centered]}>
      <Text style={TYPE.body}>Sprint in progress…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
