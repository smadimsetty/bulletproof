// Top-of-screen summary card. The text itself is computed by
// lib/trendsSummary.ts (deterministic, not a live LLM call -- see that
// module's header comment and design spec Decision 2). No loading prop:
// app/(tabs)/trends.tsx already gates this component behind its own
// top-level loading state, so a second internal spinner branch here
// would never fire -- dead code, not a real loading path.
import { Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';

export interface TrendsSummaryCardProps {
  readonly summary: string;
}

export default function TrendsSummaryCard({ summary }: TrendsSummaryCardProps) {
  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>Summary</Text>
      <Text style={TYPE.body}>{summary}</Text>
    </View>
  );
}
