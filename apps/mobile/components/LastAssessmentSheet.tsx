// apps/mobile/components/LastAssessmentSheet.tsx
//
// Bottom sheet that peeks at the most recent completed assessment for a pain
// point (and how it moved since the one before). Read-only; reachable from the
// sprint screen and from inside a sprint-day workout. Visual spec 4.5d.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import {
  buildBeforeAfterComparison,
  changeVerdict,
  fetchAssessmentDefinitions,
  fetchAssessmentHistory,
  type AssessmentComparison,
  type PastAssessment,
} from '../lib/sprintAssessment';
import { formatValue, ValueText, VerdictChip } from './AssessmentSummary';
import { ErrorState, Sheet, SkeletonRow } from './ui';

const PASS_FAIL_UNIT = 'pass/fail';

interface Loaded {
  readonly latest: PastAssessment | null;
  readonly previous: PastAssessment | null;
  readonly rows: AssessmentComparison[];
}

function describe(a: PastAssessment): string {
  const phase = a.phase === 'baseline' ? 'baseline' : 'reassessment';
  const date = new Date(a.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} · ${phase}`;
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
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Last assessment"
      subtitle={data?.latest ? describe(data.latest) : undefined}
      snap="tall"
    >
      {loading ? (
        <View>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : error ? (
        <ErrorState compact message={error} onRetry={load} />
      ) : !data?.latest ? (
        <Text style={TYPE.callout}>No assessment yet</Text>
      ) : (
        <View style={styles.list}>
          {data.rows.map((c) => {
            const verdict = data.previous ? changeVerdict(c) : null;
            const unitLabel = c.unit === PASS_FAIL_UNIT ? '' : ` ${c.unit}`;
            return (
              <View key={c.testKey} style={styles.row}>
                <Text style={TYPE.bodyStrong}>{c.name}</Text>
                <ValueText value={c.reassessment} unit={c.unit} strong />
                {data.previous ? (
                  <View style={styles.beforeRow}>
                    <Text style={TYPE.footnote}>{`was ${formatValue(c.baseline, c.unit)}${unitLabel}`}</Text>
                    <VerdictChip verdict={verdict} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.lg },
  row: { gap: 4, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.divider },
  beforeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});
