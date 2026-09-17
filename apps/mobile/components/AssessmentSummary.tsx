// apps/mobile/components/AssessmentSummary.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';
import type { AssessmentComparison, AssessmentComparisonValue } from '../lib/sprintAssessment';

const PASS_FAIL_UNIT = 'pass/fail';

// pass/fail tests are stored as 1/0 (see AssessmentForm) so the result
// schema stays uniform; they have to read back as words, not digits.
function formatNumber(n: number, unit: string): string {
  if (unit !== PASS_FAIL_UNIT) return String(n);
  return n === 1 ? 'Pass' : 'Fail';
}

function formatValue(v: AssessmentComparisonValue | null, unit: string): string {
  if (!v) return '—';
  if (v.single !== undefined) return formatNumber(v.single, unit);
  if (v.left !== undefined || v.right !== undefined) {
    const left = v.left === undefined ? '—' : formatNumber(v.left, unit);
    const right = v.right === undefined ? '—' : formatNumber(v.right, unit);
    return `L ${left} / R ${right}`;
  }
  return '—';
}

export default function AssessmentSummary({
  comparisons,
  onDone,
}: {
  comparisons: readonly AssessmentComparison[];
  onDone: () => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Before / After</Text>
      {comparisons.map((c) => {
        // "Pass pass/fail" reads as nonsense, so the unit suffix is dropped
        // for the tests whose formatted value already carries the meaning.
        const unitLabel = c.unit === PASS_FAIL_UNIT ? '' : ` ${c.unit}`;
        return (
          <View key={c.testKey} style={sharedStyles.card}>
            <Text style={sharedStyles.sectionTitle}>{c.name}</Text>
            <Text style={TYPE.body}>
              Baseline: {formatValue(c.baseline, c.unit)}
              {unitLabel}
            </Text>
            <Text style={TYPE.body}>
              Now: {formatValue(c.reassessment, c.unit)}
              {unitLabel}
            </Text>
          </View>
        );
      })}
      <Pressable style={sharedStyles.primaryButton} onPress={onDone}>
        <Text style={sharedStyles.primaryButtonText}>Pick your next sprint</Text>
      </Pressable>
    </ScrollView>
  );
}
