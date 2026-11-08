// apps/mobile/app/(tabs)/_layout.tsx
//
// Bottom tab bar: Workout / History / Trends / Settings (see docs/superpowers/specs/2026-11-07-logger-history-design.md section 1).
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Workout' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
