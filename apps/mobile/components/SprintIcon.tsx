// apps/mobile/components/SprintIcon.tsx
//
// Small pictograms for each sprint (pain point) on a 48x48 grid: a figure in the pose
// the problem is known for, with the problem area in full colour and the rest of the
// body dimmed. Unknown ids fall back to a lightning bolt.
import type { ReactNode } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const KNOWN = ['ankle', 'rounded_shoulders', 'nerd_neck', 'anterior_pelvic_tilt', 'full_body', 'total_mobility', 'knees'] as const;
type KnownId = (typeof KNOWN)[number];

export function hasSprintIcon(id: string): id is KnownId {
  return (KNOWN as readonly string[]).includes(id);
}

const DIM = 0.42;

function shapes(id: KnownId, color: string, bg: string): ReactNode {
  const line = (d: string, w: number, dim = false, key?: string) => (
    <Path key={key ?? d} d={d} stroke={color} strokeOpacity={dim ? DIM : 1} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
  const dot = (cx: number, cy: number, r: number, dim = false) => (
    <Circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill={color} fillOpacity={dim ? DIM : 1} />
  );
  switch (id) {
    case 'ankle': // a foot, side on, with the ankle joint marked
      return [
        <Path key="foot" d="M15 2H27L26 27C26.5 31 30 33.5 36 35.5L41.5 37.5C45 38.8 44.5 43 41 43H17C13.8 43 12.8 40 14.6 36.5L16.5 30Z" fill={color} fillOpacity={DIM} />,
        dot(21.5, 32.5, 4.6),
      ];
    case 'knees': // a bent leg with the knee marked
      return [line('M4 9 24 18', 8, true), line('M24 18 20 40 30 42', 6.5, true), dot(24, 18, 5.8)];
    case 'rounded_shoulders': // hunched over a laptop, upper back highlighted
      return [
        line('M8 46H40', 1.6, true),
        line('M14 33H27V46', 5, true),
        line('M14 33C11 26 13 19 21 15.5', 6.5),
        dot(25.5, 12.5, 4.6, true),
        line('M19.5 19 26 27H31', 3.6, true),
        line('M33 27.5H44M37 27.5 39.5 15.5', 2.6, true),
      ];
    case 'nerd_neck': // head craned forward and down over a phone
      return (
        <G transform="translate(-6 -12) scale(1.25)">
          {line('M19 46V31', 5, true)}
          {line('M19 31C18.8 25.5 19.3 21.5 21 18.5', 6.5, true)}
          {line('M21.5 18 27 16', 4.6)}
          {dot(30.5, 16.5, 4.8)}
          {line('M20.5 20.5 22.5 29.5 31 30', 3.6, true)}
          <Rect x={32} y={24} width={4.2} height={8} rx={1.2} transform="rotate(18 34.1 28)" fill={color} fillOpacity={DIM} />
        </G>
      );
    case 'anterior_pelvic_tilt': // the pelvis as a bowl tipping forward and spilling
      return [
        dot(24, 5, 4.4, true),
        line('M24 10.5C24 15 25.8 18.5 23.5 21.5', 6, true),
        line('M20.5 32 19.5 46M26.5 32 27.5 46', 5.5, true),
        <G key="bowl" transform="rotate(26 23.5 26)">
          <Path d="M12 20.5H35C35 30.5 29.5 34.5 23.5 34.5S12 30.5 12 20.5Z" fill={bg} stroke={color} strokeWidth={3.2} strokeLinejoin="round" />
          <Path d="M15.5 25H31.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeOpacity={0.6} />
        </G>,
        dot(38.5, 33, 2),
        dot(37.4, 38.6, 1.6),
        dot(39.6, 43, 1.3),
      ];
    case 'full_body': // upward dog
      return [line('M2 43H46', 1.6, true), line('M4 40 22 38C28 37 32 32 34 24M34 24 34 40', 4.5), dot(38, 17, 4.2)];
    case 'total_mobility': // a full-range reach
      return [
        dot(24, 8, 4.4),
        line('M24 14V28M13 6 24 16 35 6M14 43 24 28 34 43', 4.5),
        line('M7 22C6 17 7 13 9.5 10M41 22C42 17 41 13 38.5 10', 2, true),
      ];
  }
}

/** `background` is the colour behind the icon: the pelvis bowl is filled with it so the figure doesn't show through. */
export default function SprintIcon({ id, size = 24, color, background }: { id: string; size?: number; color: string; background: string }) {
  if (!hasSprintIcon(id)) return <Ionicons name="flash-outline" size={size} color={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      {shapes(id, color, background)}
    </Svg>
  );
}
