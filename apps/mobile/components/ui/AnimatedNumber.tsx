// Rolls a number up to its value. Visual spec section 3 "AnimatedNumber".
// `format` runs on the UI thread, so a custom one MUST be a worklet ('worklet' directive).
import { useEffect } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION, NUMERAL_MAX_FONT_SCALE, TYPE } from '../../lib/theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface AnimatedNumberProps {
  value: number;
  /** Must be a worklet. Defaults to fixed-point with `decimals` places. */
  format?: (n: number) => string;
  decimals?: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
  /** Roll up from 0 on first mount (default true); false shows the value immediately. */
  animateOnMount?: boolean;
  testID?: string;
}

export function AnimatedNumber({
  value,
  format,
  decimals = 0,
  style,
  duration = MOTION.roll,
  animateOnMount = true,
  testID,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const startFrom = animateOnMount && !reduced ? 0 : value;
  const shared = useSharedValue(startFrom);

  useEffect(() => {
    if (reduced) shared.value = value;
    else shared.value = withTiming(value, { duration, easing: MOTION.easeOut });
  }, [value, reduced, duration, shared]);

  const animatedProps = useAnimatedProps(() => {
    const text = format ? format(shared.value) : shared.value.toFixed(decimals);
    return { text, defaultValue: text } as any;
  });

  const initial = format ? format(startFrom) : startFrom.toFixed(decimals);

  return (
    <AnimatedTextInput
      testID={testID}
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={initial}
      maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}
      accessibilityRole="text"
      accessibilityLabel={format ? format(value) : value.toFixed(decimals)}
      style={[TYPE.stat, { padding: 0, margin: 0 }, style]}
      animatedProps={animatedProps}
    />
  );
}
