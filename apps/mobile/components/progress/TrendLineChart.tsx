// apps/mobile/components/progress/TrendLineChart.tsx
//
// Thin wrapper over react-native-gifted-charts' LineChart used by the
// assessment trends and the exercise detail screen. One or two series
// (two = left/right). Points missing a value are dropped rather than drawn
// as zero. Fewer than one usable point renders nothing.
import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, SPACING } from '../../lib/theme';

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
  const usable = points.filter((p) => (twoSeries ? p.a !== undefined && p.b !== undefined : p.a !== undefined));
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

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  axis: { fontSize: 10, color: COLORS.muted },
  legend: { flexDirection: 'row', gap: SPACING.md },
  legendText: { fontSize: 12, fontWeight: '600' },
});
