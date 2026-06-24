// apps/mobile/app/(tabs)/index.tsx
//
// Home tab placeholder. Real content (YesterdaySummaryCard +
// TodayProgramCard) lands in Phase 5. The "Open logger (demo)" link exists
// only so this phase's acceptance bar -- a reachable logger route -- is
// manually verifiable from the running app, not just by deep link; Phase 6
// replaces it with the real per-block "Log this" entry point.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home — coming in Phase 5</Text>
      <Pressable onPress={() => router.push('/logger/demo-block')}>
        <Text style={styles.link}>Open logger (demo)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  link: { fontSize: 16, color: '#0066CC' },
});
