// Visual spec section 3 "Other shared pieces": ScreenScroll (+ useScreenScroll for LargeHeader).
import { type ReactNode } from 'react';
import { RefreshControl, StyleSheet, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue, type SharedValue } from 'react-native-reanimated';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING } from '../../lib/theme';

export interface ScreenScrollProps extends Omit<ScrollViewProps, 'refreshControl'> {
  children?: ReactNode;
  refreshing?: boolean;
  /** Enables pull-to-refresh; fires a light haptic on trigger. */
  onRefresh?: () => void;
  /** Receives the scroll offset (drives LargeHeader's compact bar). */
  scrollY?: SharedValue<number>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/** Shared value for ScreenScroll's `scrollY` + CompactHeaderBar's `scrollY`. */
export function useScreenScroll() {
  return useSharedValue(0);
}

export function ScreenScroll({ children, refreshing = false, onRefresh, scrollY, contentContainerStyle, style, ...rest }: ScreenScrollProps) {
  const handler = useAnimatedScrollHandler((e) => {
    if (scrollY) scrollY.value = e.contentOffset.y;
  });
  return (
    <Animated.ScrollView
      indicatorStyle="white"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...rest}
      onScroll={scrollY ? handler : rest.onScroll}
      style={[styles.root, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              haptics.tap();
              onRefresh();
            }}
            tintColor={COLORS.accent}
          />
        ) : undefined
      }
    >
      {children}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
});
