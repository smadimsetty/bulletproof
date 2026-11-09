// apps/mobile/components/AssessmentSummary.tsx
//
// Results screen after a reassessment (visual spec 4.5e): how many tests improved,
// then one card per test with BEFORE -> AFTER and a verdict chip.
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { COLORS, ELEVATION, MOTION, SPACING, TYPE } from '../lib/theme';
import * as haptics from '../lib/haptics';
import { changeVerdict, type AssessmentComparison, type AssessmentComparisonValue, type ChangeVerdict } from '../lib/sprintAssessment';
import { Button, Card, Chip, Stat, StickyFooter } from './ui';

const PASS_FAIL_UNIT = 'pass/fail';

// pass/fail tests are stored as 1/0 (see AssessmentForm) so the result
// schema stays uniform; they have to read back as words, not digits.
function formatNumber(n: number, unit: string): string {
  if (unit !== PASS_FAIL_UNIT) return String(n);
  return n === 1 ? 'Pass' : 'Fail';
}

export function formatValue(v: AssessmentComparisonValue | null, unit: string): string {
  if (!v) return '—';
  if (v.single !== undefined) return formatNumber(v.single, unit);
  if (v.left !== undefined || v.right !== undefined) {
    const left = v.left === undefined ? '—' : formatNumber(v.left, unit);
    const right = v.right === undefined ? '—' : formatNumber(v.right, unit);
    return `L ${left} / R ${right}`;
  }
  return '—';
}

/** A value with the L / R prefixes colour-coded (cyan / amber); single values render plain. */
export function ValueText({
  value,
  unit,
  strong,
  dim,
}: {
  value: AssessmentComparisonValue | null;
  unit: string;
  strong?: boolean;
  dim?: boolean;
}) {
  const unitLabel = unit === PASS_FAIL_UNIT ? '' : ` ${unit}`;
  const base = [strong ? styles.valueStrong : TYPE.bodyStrong, styles.tabular, dim ? { color: COLORS.textTertiary } : null];
  if (!value || (value.single === undefined && value.left === undefined && value.right === undefined)) {
    return <Text style={base}>—</Text>;
  }
  if (value.single !== undefined) {
    return <Text style={base}>{`${formatNumber(value.single, unit)}${unitLabel}`}</Text>;
  }
  return (
    <Text style={base}>
      <Text style={{ color: COLORS.chartLeft }}>L </Text>
      {value.left === undefined ? '—' : `${formatNumber(value.left, unit)}${unitLabel}`}
      {'   '}
      <Text style={{ color: COLORS.chartRight }}>R </Text>
      {value.right === undefined ? '—' : `${formatNumber(value.right, unit)}${unitLabel}`}
    </Text>
  );
}

export function VerdictChip({ verdict }: { verdict: ChangeVerdict }) {
  if (!verdict) return null;
  if (verdict === 'better') return <Chip label="Better" tone="success" icon="arrow-up" />;
  if (verdict === 'worse') return <Chip label="Worse" tone="danger" icon="arrow-down" />;
  return <Chip label="Same" tone="neutral" icon="remove" />;
}

export default function AssessmentSummary({
  comparisons,
  onDone,
}: {
  comparisons: readonly AssessmentComparison[];
  /** Start another sprint (back to the picker). */
  onDone: () => void;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const improved = comparisons.filter((c) => changeVerdict(c) === 'better').length;

  useEffect(() => {
    haptics.success();
  }, []);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} indicatorStyle="white">
        <Text style={TYPE.overline}>14 days</Text>
        <Text style={TYPE.title1}>Here's what changed</Text>
        <View style={improved > 0 ? styles.glow : undefined}>
          <Stat size="hero" label="Improved" value={improved} unit={`of ${comparisons.length}`} />
        </View>
        {comparisons.map((c, i) => {
          const verdict = changeVerdict(c);
          return (
            <Animated.View
              key={c.testKey}
              entering={reduced || i >= 8 ? undefined : FadeInDown.duration(MOTION.base).delay(i * MOTION.stagger)}
            >
              <Card style={verdict === 'better' ? styles.improvedCard : undefined}>
                <View style={styles.titleRow}>
                  <Text style={[TYPE.title3, styles.flex]}>{c.name}</Text>
                  <VerdictChip verdict={verdict} />
                </View>
                <View style={styles.cols}>
                  <View style={styles.col}>
                    <Text style={TYPE.overline}>Before</Text>
                    <ValueText value={c.baseline} unit={c.unit} dim />
                  </View>
                  <View style={styles.col}>
                    <Text style={TYPE.overline}>After</Text>
                    <ValueText value={c.reassessment} unit={c.unit} strong />
                  </View>
                </View>
              </Card>
            </Animated.View>
          );
        })}
      </ScrollView>
      <StickyFooter>
        <Button title="Start another sprint" size="lg" fullWidth onPress={onDone} />
        <Button title="Done" variant="secondary" fullWidth onPress={() => router.dismissTo('/')} />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  flex: { flex: 1 },
  glow: { ...ELEVATION.glow, alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cols: { gap: SPACING.md },
  col: { gap: 2 },
  improvedCard: { borderLeftWidth: 2, borderLeftColor: COLORS.success },
  valueStrong: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
});
