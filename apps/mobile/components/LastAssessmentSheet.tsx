// apps/mobile/components/LastAssessmentSheet.tsx
//
// Bottom sheet that peeks at the most recent completed assessment for a pain
// point (and how it moved since the one before). Read-only; reachable from the
// sprint screen and from inside a sprint-day workout.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../lib/theme';
import {
  buildBeforeAfterComparison,
  changeVerdict,
  fetchAssessmentDefinitions,
  fetchAssessmentHistory,
  type AssessmentComparison,
  type ChangeVerdict,
  type PastAssessment,
} from '../lib/sprintAssessment';
import { formatValue } from './AssessmentSummary';

const PASS_FAIL_UNIT = 'pass/fail';

interface Loaded {
  readonly latest: PastAssessment | null;
  readonly previous: PastAssessment | null;
  readonly rows: AssessmentComparison[];
}

const VERDICT_LABEL: Record<Exclude<ChangeVerdict, null>, string> = {
  better: 'Better',
  worse: 'Worse',
  same: 'Same',
};

function verdictColor(v: Exclude<ChangeVerdict, null>): string {
  return v === 'better' ? COLORS.accent : v === 'worse' ? COLORS.danger : COLORS.muted;
}

function describe(a: PastAssessment): string {
  const phase = a.phase === 'baseline' ? 'baseline' : 'reassessment';
  const date = new Date(a.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Cycle ${a.cycleNumber} ${phase} · ${date}`;
}

export default function LastAssessmentSheet({
  visible,
  painPointId,
  onClose,
}: {
  visible: boolean;
  painPointId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    if (!painPointId) return;
    setLoading(true);
    setError(null);
    try {
      const [definitions, history] = await Promise.all([
        fetchAssessmentDefinitions(painPointId),
        fetchAssessmentHistory(painPointId, 2),
      ]);
      const latest = history[0] ?? null;
      const previous = history[1] ?? null;
      // "baseline" slot = the earlier assessment, "reassessment" = the latest,
      // so changeVerdict reads as movement since the previous one. With only
      // one assessment the earlier side is empty and no verdict is shown.
      const rows = latest
        ? buildBeforeAfterComparison(definitions, previous?.results ?? [], latest.results)
        : [];
      setData({ latest, previous, rows });
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your last assessment.');
    } finally {
      setLoading(false);
    }
  }, [painPointId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={sharedStyles.sectionTitle}>Last assessment</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} style={styles.pad} />
          ) : error ? (
            <View style={styles.pad}>
              <Text style={sharedStyles.warningText}>{error}</Text>
              <Pressable style={sharedStyles.primaryButton} onPress={load}>
                <Text style={sharedStyles.primaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : !data?.latest ? (
            <Text style={[sharedStyles.helperText, styles.pad]}>No assessment yet</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              <Text style={sharedStyles.helperText}>{describe(data.latest)}</Text>
              {data.rows.map((c) => {
                const unitLabel = c.unit === PASS_FAIL_UNIT ? '' : ` ${c.unit}`;
                const verdict = data.previous ? changeVerdict(c) : null;
                return (
                  <View key={c.testKey} style={styles.row}>
                    <Text style={TYPE.label}>{c.name}</Text>
                    <Text style={TYPE.body}>
                      {formatValue(c.reassessment, c.unit)}
                      {unitLabel}
                    </Text>
                    {data.previous && (
                      <Text style={sharedStyles.helperText}>
                        Before: {formatValue(c.baseline, c.unit)}
                        {unitLabel}
                        {verdict ? ' · ' : ''}
                        {verdict && <Text style={{ color: verdictColor(verdict) }}>{VERDICT_LABEL[verdict]}</Text>}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.md,
    gap: SPACING.sm,
    maxHeight: '75%',
  },
  pad: { paddingVertical: SPACING.md },
  list: { gap: SPACING.md, paddingBottom: SPACING.sm },
  row: { gap: 2 },
  close: { color: COLORS.accent, fontWeight: '600', textAlign: 'center', paddingVertical: SPACING.sm },
});
