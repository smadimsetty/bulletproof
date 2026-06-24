// apps/mobile/app/(tabs)/_layout.tsx
//
// Bottom tab bar: Home / Trends / Settings, per
// docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md's "Phase 3 --
// navigation" subsection. Text-label tabs only this phase -- no icon
// library added (see docs/superpowers/specs/2026-06-24-mobile-nav-design.md
// Decision 6). Real content for each tab lands in Phases 4/5/7.
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
