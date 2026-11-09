// apps/mobile/components/progress/AssessmentTrendsSection.tsx
//
// One card per pain point the user has assessed; per test a line chart
// across every completed assessment (Left/Right lines for bilateral tests),
// or a row of pass/fail dots.
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import type { TestTrend, TrendPoint } from '../../lib/stats/assessmentTrends';
import TrendLineChart from './TrendLineChart';

export interface PainPointTrends {
  painPointId: string;
  displayName: string;
  trends: TestTrend[];
}

function valueText(p: TrendPoint, bilateral: boolean): string {
  const f = (n: number | undefined) => (n === undefined ? '–' : String(Math.round(n * 10) / 10));
  return bilateral ? `L ${f(p.left)} / R ${f(p.right)}` : f(p.single);
}

function verdictColor(v: TestTrend['verdict']): string {
  return v === 'better' ? COLORS.accent : v === 'worse' ? COLORS.danger : COLORS.muted;
}

function passed(p: TrendPoint): boolean {
  return ((p.single ?? p.left ?? 0) as number) >= 1;
}

function TestRow({ t }: { t: TestTrend }) {
  const first = t.points[0];
  const last = t.points[t.points.length - 1];
  return (
    <View style={styles.test}>
      <Text style={TYPE.label}>{t.name}</Text>
      {t.isPassFail ? (
        <View style={styles.dots}>
          {t.points.map((p, i) => (
            <View key={i} style={[styles.dot, passed(p) ? styles.dotPass : styles.dotFail]} />
          ))}
        </View>
      ) : (
        <>
          <Text style={[TYPE.body, { color: verdictColor(t.verdict), fontWeight: '600' }]}>
            {t.points.length === 1
              ? `${valueText(first, t.isBilateral)} ${t.unit}`
              : `${valueText(first, t.isBilateral)} → ${valueText(last, t.isBilateral)} ${t.unit}`}
          </Text>
          {t.points.length === 1 ? (
            <Text style={sharedStyles.helperText}>Reassess to see a trend</Text>
          ) : (
            <TrendLineChart
              twoSeries={t.isBilateral}
              points={t.points.map((p) => ({
                label: p.label,
                a: t.isBilateral ? p.left : p.single,
                b: p.right,
              }))}
            />
          )}
        </>
      )}
    </View>
  );
}

export default function AssessmentTrendsSection({ groups }: { groups: readonly PainPointTrends[] }) {
  const visible = groups
    .map((g) => ({ ...g, trends: g.trends.filter((t) => t.points.length > 0) }))
    .filter((g) => g.trends.length > 0);

  return (
    <View style={styles.section}>
      <Text style={TYPE.sectionTitle}>Assessment trends</Text>
      {visible.length === 0 ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.helperText}>Complete an assessment in a sprint to see trends here.</Text>
        </View>
      ) : (
        visible.map((g) => (
          <View key={g.painPointId} style={sharedStyles.card}>
            <Text style={TYPE.sectionTitle}>{g.displayName}</Text>
            {g.trends.map((t) => (
              <TestRow key={t.testKey} t={t} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.sm },
  test: { gap: SPACING.xs, paddingTop: SPACING.sm },
  dots: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.accent },
  dotPass: { backgroundColor: COLORS.accent },
  dotFail: { backgroundColor: 'transparent', borderColor: COLORS.danger },
});
