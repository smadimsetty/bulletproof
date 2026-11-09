// Visual spec section 3 "Charts": gifted-charts LineChart wrapped in a Card.
// One or two series (two = L/R: chartLeft cyan, chartRight amber). Legend is always text-labelled.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { Card } from './Card';

export interface ChartSeries {
  /** Legend label ("L", "R", ...). */
  name?: string;
  color?: string;
  data: { value: number; label?: string }[];
}

export interface LineChartCardProps {
  title?: string;
  series: ChartSeries[];
  height?: number;
  /** Render without the surrounding Card. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const AXIS = { ...TYPE.caption, color: COLORS.textTertiary };

export function LineChartCard({ title, series, height = 140, bare, style, testID }: LineChartCardProps) {
  const [width, setWidth] = useState(0);
  const usable = series.filter((s) => s.data.length > 0);

  const chart = useMemo(() => {
    if (usable.length === 0 || width <= 0) return null;
    const colors = usable.map((s, i) => s.color ?? COLORS.chartSeries[i % COLORS.chartSeries.length]);
    const maxLen = Math.max(...usable.map((s) => s.data.length));
    const chartWidth = Math.max(80, width - 36);
    const spacing = maxLen > 1 ? Math.max(28, (chartWidth - 24) / (maxLen - 1)) : 0;
    // Last point larger with a bg-coloured stroke (via a bigger radius + bg dataPointColor is not
    // supported per-point stroke; use radius 6 on the last point, 4 elsewhere).
    const decorate = (s: ChartSeries, color: string) =>
      s.data.map((d, i) => ({
        value: d.value,
        label: d.label,
        dataPointRadius: i === s.data.length - 1 ? 6 : 4,
        dataPointColor: color,
      }));
    const common = {
      height,
      width: chartWidth,
      spacing,
      initialSpacing: 12,
      endSpacing: 12,
      curved: true,
      noOfSections: 3,
      rulesColor: COLORS.chartGrid,
      rulesType: 'solid' as const,
      yAxisColor: 'transparent',
      xAxisColor: 'transparent',
      yAxisTextStyle: AXIS,
      xAxisLabelTextStyle: AXIS,
      isAnimated: true,
      animationDuration: 600,
      areaChart: true,
      disableScroll: maxLen < 7,
      hideDataPoints: false,
    };
    const [a, b] = usable;
    return (
      <LineChart
        {...common}
        data={decorate(a, colors[0])}
        data2={b ? decorate(b, colors[1]) : undefined}
        thickness={3}
        color1={colors[0]}
        color2={colors[1]}
        dataPointsColor1={colors[0]}
        dataPointsColor2={colors[1]}
        dataPointsRadius1={4}
        dataPointsRadius2={4}
        startFillColor1={colors[0]}
        endFillColor1={colors[0]}
        startOpacity1={0.18}
        endOpacity1={0}
        startFillColor2={colors[1]}
        endFillColor2={colors[1]}
        startOpacity2={0.18}
        endOpacity2={0}
      />
    );
  }, [usable, width, height]);

  const body = (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={testID}>
      {title || usable.some((s) => s.name) ? (
        <View style={styles.head}>
          {title ? <Text style={TYPE.title3}>{title}</Text> : <View />}
          <View style={styles.legend}>
            {usable.map((s, i) =>
              s.name ? (
                <View key={s.name} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: s.color ?? COLORS.chartSeries[i % COLORS.chartSeries.length] }]} />
                  <Text style={TYPE.caption}>{s.name}</Text>
                </View>
              ) : null
            )}
          </View>
        </View>
      ) : null}
      {chart}
    </View>
  );
  return bare ? <View style={style}>{body}</View> : <Card style={style}>{body}</Card>;
}

/** Pass/fail rows: 12 px circles, pass = success fill, fail = 1.5 px danger outline, 6 gap. */
export function PassFailDots({ results, style }: { results: boolean[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.dots, style]}>
      {results.map((ok, i) => (
        <View
          key={i}
          accessibilityLabel={ok ? 'Pass' : 'Fail'}
          style={ok ? styles.pass : styles.fail}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  legend: { flexDirection: 'row', gap: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pass: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.success },
  fail: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.danger },
});
