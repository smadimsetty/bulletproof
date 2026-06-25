// Sleep-hours line chart with a training-type color strip beneath it
// (design spec's "sleep line overlaid with a training-type strip").
// Gaps in sleep data render as 0 on the line rather than being dropped --
// gifted-charts' LineChart has no first-class "missing value" gap
// rendering, and a personal app at this data volume doesn't warrant
// building one; a 0 dip reads clearly enough as "no recovery data that
// day" right next to the training strip confirming whether a session
// happened.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { labelForSessionType } from '../lib/sessionTypeLabels';
import type { HistoryPoint } from '../lib/trendsHistory';
import type { SessionType } from '../lib/recommendations';

export interface SleepTrainingChartProps {
  readonly history: readonly HistoryPoint[];
}

const SESSION_TYPE_COLORS: Record<SessionType, string> = {
  upper: '#3A6B5C',
  lower: '#6B8E7F',
  pickleball: '#C98A3E',
  run: '#4E7FB3',
  rest: '#B7B2AB',
  mobility: '#A66B8E',
};

function shortDayLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function SleepTrainingChart({ history }: SleepTrainingChartProps) {
  const lineData = history.map((point, index) => ({
    value: point.sleepHrs ?? 0,
    label: index % Math.max(1, Math.floor(history.length / 6)) === 0 ? shortDayLabel(point.date) : '',
  }));

  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>Sleep & training</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <LineChart
          data={lineData}
          height={140}
          color={COLORS.accent}
          thickness={2}
          curved
          areaChart
          startFillColor={COLORS.accentMuted}
          endFillColor={COLORS.accentMuted}
          startOpacity={0.6}
          endOpacity={0.05}
          hideRules
          yAxisTextStyle={TYPE.helper}
          xAxisLabelTextStyle={TYPE.helper}
          noOfSections={4}
          spacing={Math.max(8, 360 / Math.max(1, history.length))}
          initialSpacing={SPACING.sm}
        />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.strip}>
          {history.map((point) => (
            <View
              key={point.date}
              style={[
                styles.stripCell,
                { backgroundColor: point.sessionType ? SESSION_TYPE_COLORS[point.sessionType] : COLORS.border },
              ]}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.legend}>
        {(Object.keys(SESSION_TYPE_COLORS) as SessionType[]).map((type) => (
          <View key={type} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SESSION_TYPE_COLORS[type] }]} />
            <Text style={sharedStyles.helperText}>{labelForSessionType(type)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 2, marginTop: SPACING.xs },
  stripCell: { width: 10, height: 10, borderRadius: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
