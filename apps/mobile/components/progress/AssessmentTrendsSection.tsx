// apps/mobile/components/progress/AssessmentTrendsSection.tsx
//
// One collapsed card per pain point the user has assessed (tap to open, so the list
// stays short as areas pile up); inside, per test a line chart across every completed
// assessment (L/R lines for bilateral tests), or a row of pass/fail dots.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import type { TestTrend, TrendPoint } from '../../lib/stats/assessmentTrends';
import { Card, Disclosure, EmptyState, LineChartCard, PassFailDots, SectionHeader, type ChartSeries } from '../ui';
import SprintIcon from '../SprintIcon';

export interface PainPointTrends {
  painPointId: string;
  displayName: string;
  trends: TestTrend[];
}

function valueText(p: TrendPoint, bilateral: boolean): string {
  const f = (n: number | undefined) => (n === undefined ? '–' : String(Math.round(n * 10) / 10));
  return bilateral ? `L ${f(p.left)} / R ${f(p.right)}` : f(p.single);
}

function passed(p: TrendPoint): boolean {
  return ((p.single ?? p.left ?? 0) as number) >= 1;
}

const VERDICT = {
  better: { color: COLORS.success, icon: 'arrow-up' as const },
  worse: { color: COLORS.danger, icon: 'arrow-down' as const },
  same: { color: COLORS.textTertiary, icon: 'remove' as const },
};

function seriesFor(t: TestTrend): ChartSeries[] {
  const pick = (get: (p: TrendPoint) => number | undefined) =>
    t.points.flatMap((p) => {
      const v = get(p);
      return v === undefined ? [] : [{ value: v, label: p.label }];
    });
  if (t.isBilateral) {
    return [
      { name: 'L', color: COLORS.chartLeft, data: pick((p) => p.left) },
      { name: 'R', color: COLORS.chartRight, data: pick((p) => p.right) },
    ].filter((s) => s.data.length > 0);
  }
  return [{ color: COLORS.accent, data: pick((p) => p.single) }];
}

function TestRow({ t }: { t: TestTrend }) {
  const first = t.points[0];
  const last = t.points[t.points.length - 1];
  const verdict = t.verdict ? VERDICT[t.verdict] : null;
  return (
    <View style={styles.test}>
      <View style={styles.testHead}>
        <Text style={[TYPE.callout, styles.testName]} numberOfLines={2}>
          {t.name}
        </Text>
        {!t.isPassFail ? (
          <View style={styles.headline}>
            {verdict ? <Ionicons name={verdict.icon} size={14} color={verdict.color} /> : null}
            <Text style={[TYPE.stat, styles.headlineText, { color: verdict?.color ?? COLORS.textPrimary }]} numberOfLines={1}>
              {t.points.length === 1
                ? `${valueText(first, t.isBilateral)} ${t.unit}`
                : `${valueText(first, t.isBilateral)} → ${valueText(last, t.isBilateral)} ${t.unit}`}
            </Text>
          </View>
        ) : null}
      </View>
      {t.isPassFail ? (
        <PassFailDots results={t.points.map(passed)} />
      ) : t.points.length === 1 ? (
        <Text style={TYPE.footnote}>Reassess to see a trend</Text>
      ) : (
        <LineChartCard bare series={seriesFor(t)} />
      )}
    </View>
  );
}

export default function AssessmentTrendsSection({
  groups,
  onStartSprint,
}: {
  groups: readonly PainPointTrends[];
  onStartSprint: () => void;
}) {
  const visible = groups
    .map((g) => ({ ...g, trends: g.trends.filter((t) => t.points.length > 0) }))
    .filter((g) => g.trends.length > 0);

  return (
    <View style={styles.section}>
      <SectionHeader title="Assessments" inset={SPACING.xs} />
      {visible.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="analytics-outline"
            title="No assessments yet"
            body="Complete a sprint's baseline to start tracking."
            action={{ label: 'Start a sprint', onPress: onStartSprint }}
          />
        </Card>
      ) : (
        visible.map((g) => {
          const count = Math.max(...g.trends.map((t) => t.points.length));
          return (
            <Card key={g.painPointId}>
              <Disclosure
                accessibilityLabel={`${g.displayName} assessments`}
                bodyStyle={styles.body}
                header={
                  <View style={styles.areaHead}>
                    <View style={styles.areaIcon}>
                      <SprintIcon id={g.painPointId} size={26} color={COLORS.accent} background={COLORS.accentTint} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={TYPE.title3}>{g.displayName}</Text>
                      <Text style={TYPE.footnote}>{`${count} ${count === 1 ? 'assessment' : 'assessments'}`}</Text>
                    </View>
                  </View>
                }
              >
                {g.trends.map((t) => (
                  <TestRow key={t.testKey} t={t} />
                ))}
              </Disclosure>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING.lg, marginTop: SPACING.lg },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  areaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accentTint, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  section: { gap: SPACING.md },
  test: { gap: SPACING.sm, paddingTop: SPACING.sm },
  testHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  testName: { flexShrink: 1 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexShrink: 1 },
  headlineText: { fontSize: 17, lineHeight: 22 },
});
