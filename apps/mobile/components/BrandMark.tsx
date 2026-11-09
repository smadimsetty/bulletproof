// apps/mobile/components/BrandMark.tsx
//
// The "Range" mark (visual spec 6): a 270 degree open arc with a joint ball at its
// leading end. Static; the animated sign-in version reuses the same geometry.
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS } from '../lib/theme';

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
