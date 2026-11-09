// apps/mobile/components/DescriptionToggle.tsx
//
// Eye icon that collapses/expands a long description on an exercise or assessment card
// (visual spec section 3 "DescriptionToggle"). Exports unchanged: callers render the button only
// when there is text, track `open` with useToggle, and render the text while open. New:
// DescriptionBody animates that reveal (height + opacity) if a caller wraps its text in it.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, TYPE } from '../lib/theme';
import { PressableScale } from './ui/PressableScale';

export function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

export function DescriptionToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <PressableScale
      onPress={onToggle}
      haptic="select"
      scaleTo={0.9}
      hitSlop={13}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide description' : 'Show description'}
      accessibilityState={{ expanded: open }}
    >
      <Ionicons name={open ? 'eye-off-outline' : 'eye-outline'} size={18} color={open ? COLORS.accent : COLORS.textTertiary} />
    </PressableScale>
  );
}

/** Animated reveal for description text. Pass a string, or children for custom content. */
export function DescriptionBody({ open, text, children }: { open: boolean; text?: string; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (reduced) progress.value = withTiming(open ? 1 : 0, { duration: 150 });
    else progress.value = withTiming(open ? 1 : 0, { duration: MOTION.base, easing: MOTION.easeOut });
  }, [open, reduced, progress]);

  const outer = useAnimatedStyle(() => ({
    height: height > 0 ? height * progress.value : 0,
    opacity: progress.value,
  }));

  return (
    <Animated.View style={[styles.outer, outer]} pointerEvents={open ? 'auto' : 'none'}>
      <View style={styles.inner} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {text != null ? <Text style={[TYPE.callout, styles.text]}>{text}</Text> : children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: 'hidden' },
  inner: { position: 'absolute', left: 0, right: 0, top: 0 },
  text: { color: COLORS.textSecondary, lineHeight: 20 },
});
