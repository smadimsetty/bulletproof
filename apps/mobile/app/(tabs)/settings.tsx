// apps/mobile/app/(tabs)/settings.tsx
//
// Settings tab placeholder. Real content (preferred split, activities,
// pains, goals, training frequency, diet, weight/birth date, location,
// HealthKit toggle) lands in Phase 4.
import { StyleSheet, Text, View } from 'react-native';

export default function Settings() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
