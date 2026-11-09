// Visual spec section 3 "Skeleton" + presets. Shimmer = opacity loop 0.5 <-> 1; static 0.7 under Reduce Motion.
import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLORS, RADII, SPACING } from '../../lib/theme';
import { Card } from './Card';

export interface SkeletonProps {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, radius = RADII.sm, style }: SkeletonProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.7 : 0.5);
  useEffect(() => {
    if (reduced) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = 0.5;
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: COLORS.elevated }, animated, style]} />;
}

export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={styles.rowBars}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton width="40%" height={14} />
      <Skeleton width="90%" height={12} />
      <Skeleton width="70%" height={12} />
    </Card>
  );
}

export function SkeletonStat() {
  return (
    <Card padding={14} style={styles.stat}>
      <Skeleton width="50%" height={12} />
      <Skeleton width="60%" height={32} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  rowBars: { flex: 1, gap: SPACING.sm },
  stat: { minHeight: 96, justifyContent: 'center' },
});
