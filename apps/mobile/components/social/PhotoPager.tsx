// apps/mobile/components/social/PhotoPager.tsx
//
// Horizontally swipeable photos (one per page, 4:5 by default) with page dots (visual spec 4.15).
// Optional double-tap: a big accent heart pops at the tap point and fades, then onDoubleTap fires.
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, RADII, SPACING } from '../../lib/theme';
import SignedImage from './SignedImage';

const HEART = 80;
const DOUBLE_TAP_MS = 280;

export default function PhotoPager({
  paths,
  aspectRatio = 4 / 5,
  onDoubleTap,
}: {
  paths: readonly string[];
  aspectRatio?: number;
  onDoubleTap?: () => void;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [heartAt, setHeartAt] = useState<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  if (paths.length === 0) return null;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function tapped(x: number, y: number) {
    if (!onDoubleTap) return;
    const now = Date.now();
    if (now - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    setHeartAt({ x, y });
    if (reduced) {
      scale.value = 1;
      opacity.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 380 }));
    } else {
      scale.value = 0.4;
      scale.value = withSpring(1, MOTION.popSpring);
      opacity.value = withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 200 }), withTiming(0, { duration: 180 }));
    }
    onDoubleTap();
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}>
          {paths.map((p) => (
            <Pressable key={p} onPress={(e) => tapped(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
              <SignedImage path={p} style={{ width, height: width / aspectRatio }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {heartAt ? (
        <Animated.View pointerEvents="none" style={[styles.heart, { left: heartAt.x - HEART / 2, top: heartAt.y - HEART / 2 }, heartStyle]}>
          <Ionicons name="heart" size={HEART} color={COLORS.accent} />
        </Animated.View>
      ) : null}
      {paths.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {paths.map((p, i) => (
            <View key={p} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: RADII.md },
  heart: { position: 'absolute' },
  dots: { position: 'absolute', bottom: SPACING.sm, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: COLORS.textPrimary },
});
