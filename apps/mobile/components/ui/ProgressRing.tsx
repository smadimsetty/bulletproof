// Visual spec section 3 "ProgressRing".
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ELEVATION, MOTION, TYPE } from '../../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0..1+. >= 1 shows the full ring, glow and a popping checkmark. */
  progress: number;
  size?: number;
  stroke?: number;
  /** Center content. Defaults to `current/total` as a stat when both are given. */
  label?: ReactNode;
  current?: number;
  total?: number;
  tone?: 'accent' | 'success';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressRing({ progress, size = 72, stroke = 8, label, current, total, tone = 'accent', style, testID }: ProgressRingProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const complete = progress >= 1;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = tone === 'success' ? COLORS.success : COLORS.accent;

  const p = useSharedValue(0);
  const pop = useSharedValue(complete ? 1 : 0);

  useEffect(() => {
    if (reduced) p.value = clamped;
    else p.value = withTiming(clamped, { duration: MOTION.roll, easing: MOTION.easeOut });
  }, [clamped, reduced, p]);

  useEffect(() => {
    if (complete) pop.value = reduced ? withTiming(1, { duration: 150 }) : withSpring(1, { ...MOTION.popSpring });
    else pop.value = 0;
  }, [complete, reduced, pop]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - p.value) }));
  const popStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.6 + 0.4 * pop.value }] }));

  const center =
    complete ? (
      <Animated.View style={popStyle}>
        <Ionicons name="checkmark" size={Math.round(size * 0.4)} color={color} />
      </Animated.View>
    ) : label !== undefined ? (
      label
    ) : current != null && total != null ? (
      <Text style={TYPE.stat} maxFontSizeMultiplier={1.2}>{`${current}/${total}`}</Text>
    ) : null;

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        { width: size, height: size },
        complete ? [{ borderRadius: size / 2, backgroundColor: COLORS.bg }, ELEVATION.glow] : null,
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.elevated} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {center}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
