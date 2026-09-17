// apps/mobile/components/AssessmentSummary.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';
import type { AssessmentComparison, AssessmentComparisonValue } from '../lib/sprintAssessment';

function formatValue(v: AssessmentComparisonValue | null): string {
  if (!v) return '—';
  if (v.single !== undefined) return String(v.single);
  if (v.left !== undefined || v.right !== undefined) return `L ${v.left ?? '—'} / R ${v.right ?? '—'}`;
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
      {comparisons.map((c) => (
        <View key={c.testKey} style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>{c.name}</Text>
          <Text style={TYPE.body}>
            Baseline: {formatValue(c.baseline)} {c.unit}
          </Text>
          <Text style={TYPE.body}>
            Now: {formatValue(c.reassessment)} {c.unit}
          </Text>
        </View>
      ))}
      <Pressable style={sharedStyles.primaryButton} onPress={onDone}>
        <Text style={sharedStyles.primaryButtonText}>Pick your next sprint</Text>
      </Pressable>
    </ScrollView>
  );
}
