// Visual spec section 3 "Header styling" (LargeHeader form).
// <LargeHeader> is the in-content title row. <CompactHeaderBar> is the overlay that fades in once
// scrollY passes ~40; render it as an absolute sibling above the scroll view, and feed both from
// the same `scrollY` (see useScreenScroll / ScreenScroll).
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE } from '../../lib/theme';

export interface LargeHeaderProps {
  title: string;
  /** Up to two IconButtons. */
  actions?: ReactNode;
  /** Set false when a native header / safe-area wrapper already pads the top. */
  includeTopInset?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function LargeHeader({ title, actions, includeTopInset = true, style }: LargeHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: (includeTopInset ? insets.top : 0) + SPACING.sm }, style]}>
      <Text style={[TYPE.title1, styles.title]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

export function CompactHeaderBar({ title, scrollY }: { title: string; scrollY: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [32, 48], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.compact, { height: insets.top + 44, paddingTop: insets.top }, style]}
    >
      <Text style={TYPE.title3} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: SPACING.md, gap: SPACING.md },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  compact: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,12,15,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
});
