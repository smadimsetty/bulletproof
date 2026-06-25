// Bar chart, one bar per muscle group, total volume across the selected
// range (design spec Decision 6 -- a bar must map 1:1 to a drill-down
// target). Tapping a bar calls onBarPress with that body part's name.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import type { BodyPartVolumeTotal } from '../lib/muscleGroupVolume';

export interface MuscleGroupVolumeChartProps {
  readonly totals: readonly BodyPartVolumeTotal[];
  readonly onBarPress: (bodyPart: string) => void;
}

function titleCase(bodyPart: string): string {
  return bodyPart.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MuscleGroupVolumeChart({ totals, onBarPress }: MuscleGroupVolumeChartProps) {
  if (totals.length === 0) {
    return (
      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Volume by muscle group</Text>
        <Text style={sharedStyles.helperText}>No logged sets in this range yet.</Text>
      </View>
    );
  }

  const barData = totals.map((total) => ({
    value: total.volume,
    label: titleCase(total.bodyPart),
    frontColor: COLORS.accent,
    onPress: () => onBarPress(total.bodyPart),
  }));

  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>Volume by muscle group</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={barData}
          height={160}
          barWidth={28}
          spacing={SPACING.md}
          roundedTop
          hideRules
          yAxisTextStyle={TYPE.helper}
          xAxisLabelTextStyle={styles.barLabel}
          noOfSections={4}
        />
      </ScrollView>
      <Text style={sharedStyles.helperText}>Tap a bar to see your best lifts for that muscle group.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  barLabel: { fontSize: 11, color: COLORS.muted },
});
