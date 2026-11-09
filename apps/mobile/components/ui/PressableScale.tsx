// Shared pressable: scales to 0.97 on press-in, springs back, fires a haptic on press.
// Visual spec section 3 "PressableScale" and 2.5 "Press scale".
import { type ReactNode } from 'react';
import { Pressable, type AccessibilityRole, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { MOTION } from '../../lib/theme';
import * as haptics from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: PressableProps['onPressIn'];
  onPressOut?: PressableProps['onPressOut'];
  disabled?: boolean;
  scaleTo?: number;
  haptic?: 'tap' | 'primary' | 'select' | 'none';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: PressableProps['hitSlop'];
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: PressableProps['accessibilityState'];
  accessibilityHint?: string;
}

export function PressableScale({
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled = false,
  scaleTo = 0.97,
  haptic = 'tap',
  children,
  style,
  hitSlop,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityHint,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={(e) => {
        if (!disabled && !reduced) scale.value = withTiming(scaleTo, { duration: MOTION.fast, easing: MOTION.standard });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) scale.value = withSpring(1, { ...MOTION.spring });
        onPressOut?.(e);
      }}
      onPress={() => {
        if (haptic === 'tap') haptics.tap();
        else if (haptic === 'primary') haptics.primary();
        else if (haptic === 'select') haptics.select();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[style, disabled ? { opacity: 0.4 } : null, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
