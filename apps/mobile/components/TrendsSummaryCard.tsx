// Top-of-screen summary card. The text itself is computed by
// lib/trendsSummary.ts (deterministic, not a live LLM call -- see that
// module's header comment and design spec Decision 2).
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../lib/theme';

export interface TrendsSummaryCardProps {
  readonly loading: boolean;
  readonly summary: string;
}

export default function TrendsSummaryCard({ loading, summary }: TrendsSummaryCardProps) {
  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>Summary</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={styles.spinner} />
      ) : (
        <Text style={TYPE.body}>{summary}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { alignSelf: 'flex-start' },
});
