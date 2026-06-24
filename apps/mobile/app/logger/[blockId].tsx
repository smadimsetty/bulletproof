// apps/mobile/app/logger/[blockId].tsx
//
// Logger placeholder, presented as a modal (configured in
// app/_layout.tsx's Stack.Screen options). Echoes the blockId route param
// back to prove the dynamic-segment plumbing works end to end -- real
// content (pre-populated exercises, MobilityChecklistRow/StrengthSetRow,
// swap/remove, Start/End workout) lands in Phase 6.
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function Logger() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logger — coming in Phase 6</Text>
      <Text style={styles.subtitle}>blockId: {blockId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#3A3A3C' },
});
