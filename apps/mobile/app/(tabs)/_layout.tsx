// apps/mobile/app/(tabs)/_layout.tsx
//
// Bottom tab bar: Workout / History / Progress / Feed / Profile (Settings is
// a stack screen reached from the Profile tab's gear). Visual spec 3 "TabBar
// styling" + 4.4: the ActiveWorkoutBanner is rendered here once, docked above
// the tab bar on every tab.
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, TYPE } from '../../lib/theme';
import { fetchActiveWorkout, subscribeToActiveWorkoutChanges, type ActiveWorkoutSummary } from '../../lib/workouts';
import { fetchUnreadCount, subscribeToUnreadChanges } from '../../lib/social/notifications';
import ActiveWorkoutBanner from '../../components/ActiveWorkoutBanner';
import { PressableScale } from '../../components/ui';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(filled: IconName, outline: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={SIZES.iconLg} color={color} />
  );
}

// Tab buttons press-scale with a selection haptic (spec 3 TabBar styling).
function TabButton(props: any) {
  return (
    <PressableScale
      haptic="select"
      scaleTo={0.94}
      onPress={() => props.onPress?.()}
      onLongPress={props.onLongPress ?? undefined}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={props.accessibilityState}
      testID={props.testID}
      style={props.style}
    >
      {props.children}
    </PressableScale>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = SIZES.tabBar + insets.bottom;
  const [active, setActive] = useState<ActiveWorkoutSummary | null>(null);
  const [unread, setUnread] = useState(0);

  // Unread inbox count for the Feed tab badge. Silent on failure: the badge is a convenience.
  const loadUnread = useCallback(() => {
    fetchUnreadCount()
      .then(setUnread)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadUnread();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadUnread();
    });
    const unsubscribe = subscribeToUnreadChanges(loadUnread);
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [loadUnread]);

  const loadActive = useCallback(() => {
    fetchActiveWorkout()
      .then(setActive)
      .catch(() => {
        // Silent: the banner is a convenience; the Workout tab surfaces load errors.
      });
  }, []);

  useEffect(() => {
    loadActive();
    return subscribeToActiveWorkoutChanges(loadActive);
  }, [loadActive]);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.tabBar,
            borderTopColor: COLORS.divider,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: tabBarHeight,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textTertiary,
          tabBarLabelStyle: { fontSize: TYPE.caption.fontSize, fontWeight: TYPE.caption.fontWeight, letterSpacing: TYPE.caption.letterSpacing },
          tabBarButton: TabButton,
          sceneStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Workout', tabBarIcon: icon('barbell', 'barbell-outline') }} />
        <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time', 'time-outline') }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart', 'stats-chart-outline') }} />
        <Tabs.Screen
          name="feed"
          options={{
            title: 'Feed',
            tabBarIcon: icon('people', 'people-outline'),
            tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
            tabBarBadgeStyle: { backgroundColor: COLORS.danger, color: COLORS.onDanger },
          }}
        />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
      </Tabs>
      {active ? (
        <ActiveWorkoutBanner workout={active} onDiscarded={loadActive} bottom={tabBarHeight + SPACING.sm} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
});
