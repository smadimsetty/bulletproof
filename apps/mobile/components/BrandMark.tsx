// apps/mobile/components/BrandMark.tsx
//
// The "Range" mark (visual spec 6): a 270 degree open arc with a joint ball at its
// leading end. BrandMark is static (share cards); AnimatedBrandMark draws the arc over
// 700 ms and pops the ball (sign-in, cold-launch gate). Reduce Motion: static.
import { useEffect } from 'react';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, MOTION } from '../lib/theme';

export const MARK_ARC_PATH = 'M 299.9 724.1 A 300 300 0 1 1 724.1 724.1';
export const MARK_BALL = { cx: 724.1, cy: 724.1, r: 84 } as const;
export const MARK_ARC_LENGTH = 1.5 * Math.PI * 300; // 270 degrees at r = 300

export default function BrandMark({ size = 96, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" opacity={opacity}>
      <Path d={MARK_ARC_PATH} fill="none" stroke={COLORS.accent} strokeWidth={112} strokeLinecap="round" />
      <Circle cx={MARK_BALL.cx} cy={MARK_BALL.cy} r={MARK_BALL.r} fill={COLORS.accent} />
      <Circle cx={MARK_BALL.cx} cy={MARK_BALL.cy} r={MARK_BALL.r} fill="none" stroke={COLORS.bg} strokeWidth={16} />
    </Svg>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AnimatedBrandMark({ size = 96 }: { size?: number }) {
  const reduced = useReducedMotion();
  const draw = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      draw.value = 1;
      pop.value = 1;
      return;
    }
    draw.value = withTiming(1, { duration: 700, easing: MOTION.easeOut }, (finished) => {
      if (finished) pop.value = withSpring(1, MOTION.popSpring);
    });
  }, [reduced, draw, pop]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: MARK_ARC_LENGTH * (1 - draw.value) }));
  const ballProps = useAnimatedProps(() => ({ r: MARK_BALL.r * pop.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <AnimatedPath
        d={MARK_ARC_PATH}
        fill="none"
        stroke={COLORS.accent}
        strokeWidth={112}
        strokeLinecap="round"
        strokeDasharray={`${MARK_ARC_LENGTH} ${MARK_ARC_LENGTH}`}
        animatedProps={arcProps}
      />
      <AnimatedCircle cx={MARK_BALL.cx} cy={MARK_BALL.cy} fill={COLORS.accent} animatedProps={ballProps} />
      <AnimatedCircle cx={MARK_BALL.cx} cy={MARK_BALL.cy} fill="none" stroke={COLORS.bg} strokeWidth={16} animatedProps={ballProps} />
    </Svg>
  );
}
