// apps/mobile/components/progress/TrendLineChart.tsx
//
// Thin wrapper over react-native-gifted-charts' LineChart used by the
// assessment trends and the exercise detail screen. One or two series
// (two = left/right). Points missing a value are dropped rather than drawn
// as zero; when only some points have both sides, each side that has data
// is drawn as its own series. No usable point renders nothing.
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, LEGACY_SPACING as SPACING } from '../../lib/theme';

export interface ChartPoint {
  label: string;
  a?: number;
  b?: number;
}

const COLOR_B = '#C98A3E';

export default function TrendLineChart({
  points,
  twoSeries,
  seriesNames = ['L', 'R'],
  height = 120,
  width = 260,
}: {
  points: readonly ChartPoint[];
  twoSeries?: boolean;
  seriesNames?: [string, string] | string[];
  height?: number;
  width?: number;
}) {
  const complete = twoSeries && points.every((p) => p.a !== undefined && p.b !== undefined);
  if (twoSeries && !complete) {
    const sides = [
      { key: 'a' as const, name: seriesNames[0], color: COLORS.accent },
      { key: 'b' as const, name: seriesNames[1], color: COLOR_B },
    ].filter((s) => points.some((p) => p[s.key] !== undefined));
    if (sides.length === 0) return null;
    return (
      <View style={styles.wrap}>
        {sides.map((s) => (
          <View key={s.key} style={styles.wrap}>
            <Text style={[styles.legendText, { color: s.color }]}>● {s.name}</Text>
            {renderSingle(points.filter((p) => p[s.key] !== undefined).map((p) => ({ label: p.label, value: p[s.key] as number })), s.color, height, width)}
          </View>
        ))}
      </View>
    );
  }
  const usable = points.filter((p) => p.a !== undefined);
  if (usable.length === 0) return null;

  const dataA = usable.map((p) => ({ value: p.a as number }));
  const dataB = usable.map((p) => ({ value: p.b as number }));
  const spacing = usable.length > 1 ? Math.max(36, (width - 30) / (usable.length - 1)) : 0;

  return (
    <View style={styles.wrap}>
      <LineChart
        data={dataA}
        data2={twoSeries ? dataB : undefined}
        height={height}
        width={width}
        spacing={spacing}
        initialSpacing={12}
        endSpacing={12}
        color1={COLORS.accent}
        color2={COLOR_B}
        dataPointsColor1={COLORS.accent}
        dataPointsColor2={COLOR_B}
        thickness1={2}
        thickness2={2}
        noOfSections={3}
        hideRules
        yAxisTextStyle={styles.axis}
        xAxisLabelTexts={usable.map((p) => p.label)}
        xAxisLabelTextStyle={styles.axis}
        disableScroll={usable.length < 6}
      />
      {twoSeries && (
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: COLORS.accent }]}>● {seriesNames[0]}</Text>
          <Text style={[styles.legendText, { color: COLOR_B }]}>● {seriesNames[1]}</Text>
        </View>
      )}
    </View>
  );
}

function renderSingle(rows: { label: string; value: number }[], color: string, height: number, width: number) {
  const spacing = rows.length > 1 ? Math.max(36, (width - 30) / (rows.length - 1)) : 0;
  return (
    <LineChart
      data={rows.map((r) => ({ value: r.value }))}
      height={height}
      width={width}
      spacing={spacing}
      initialSpacing={12}
      endSpacing={12}
      color1={color}
      dataPointsColor1={color}
      thickness1={2}
      noOfSections={3}
      hideRules
      yAxisTextStyle={styles.axis}
      xAxisLabelTexts={rows.map((r) => r.label)}
      xAxisLabelTextStyle={styles.axis}
      disableScroll={rows.length < 6}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  axis: { fontSize: 10, color: COLORS.muted },
  legend: { flexDirection: 'row', gap: SPACING.md },
  legendText: { fontSize: 12, fontWeight: '600' },
});
