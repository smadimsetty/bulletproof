// apps/mobile/app/(tabs)/trends.tsx
//
// Trends tab placeholder. Real content (time-range selector, AI summary,
// sleep/training overlay, muscle-group volume chart) lands in Phase 7.
import { StyleSheet, Text, View } from 'react-native';

export default function Trends() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trends — coming in Phase 7</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
