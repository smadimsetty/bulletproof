// apps/mobile/app/(tabs)/_layout.tsx
//
// Bottom tab bar: Workout / History / Progress / Feed / Profile (Settings is
// a stack screen reached from the Profile tab's gear; see
// docs/superpowers/specs/2026-11-08-finish-the-app-design.md Stage 3).
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { COLORS } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: COLORS.accent }}>
      <Tabs.Screen name="index" options={{ title: 'Workout', tabBarIcon: icon('barbell-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
