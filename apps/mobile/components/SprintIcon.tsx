// apps/mobile/components/SprintIcon.tsx
//
// Small line drawings for each sprint (pain point), drawn on a 24x24 grid in one stroke
// colour so they sit next to Ionicons. Unknown ids fall back to a lightning bolt.
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const KNOWN = ['ankle', 'rounded_shoulders', 'nerd_neck', 'anterior_pelvic_tilt', 'full_body', 'total_mobility', 'knees'] as const;
type KnownId = (typeof KNOWN)[number];

export function hasSprintIcon(id: string): id is KnownId {
  return (KNOWN as readonly string[]).includes(id);
}

function Shapes({ id, color }: { id: KnownId; color: string }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (id) {
    case 'ankle': // lower leg and foot, side on, with the ankle bone marked
      return (
        <>
          <Path {...s} d="M8 2v11.5c0 1.6-1 2.8-2.6 3.4L4.5 17.3c-1 .4-1.2 2.7.5 2.7H19c1.4 0 1.6-1.6.5-2.3l-4.3-2.4c-1.3-.7-2.2-1.9-2.2-3.4V2" />
          <Circle cx={12.4} cy={15.3} r={1.1} fill={color} />
        </>
      );
    case 'rounded_shoulders': // head and shoulders, with the shoulders drawing back
      return (
        <>
          <Circle {...s} cx={12} cy={6} r={3} />
          <Path {...s} d="M5 21v-3.5C5 14 8 12.5 12 12.5s7 1.5 7 5V21" />
          <Path {...s} d="M4.5 12.5 2 10.5M4.5 12.5 2.3 14.6M19.5 12.5 22 10.5M19.5 12.5 21.7 14.6" />
        </>
      );
    case 'nerd_neck': // side profile with the head pushed forward of the dashed plumb line
      return (
        <>
          <Line {...s} x1={8} y1={2.5} x2={8} y2={21.5} strokeDasharray="2 2.5" strokeWidth={1.3} />
          <Circle {...s} cx={15.5} cy={6.5} r={3.2} />
          <Path {...s} d="M8.5 21.5c-.4-4.5.6-8.6 4.8-12" />
        </>
      );
    case 'anterior_pelvic_tilt': // a pelvis bowl tipped forward, with the tilt arrow
      return (
        <>
          <Path {...s} d="M4.5 7.5 18.5 10.5M4.5 7.5c-.6 5 2.2 8.8 6.6 9.8 4.4.9 7.6-2.1 7.4-6.8" />
          <Path {...s} d="M6 20.5c3 1.2 7 1 10-.8m0 0-2.4-.6m2.4.6-.6 2.3" />
        </>
      );
    case 'full_body': // upward dog: hips low, chest lifted on straight arms
      return (
        <>
          <Line {...s} x1={2} y1={21} x2={22} y2={21} strokeWidth={1.3} />
          <Path {...s} d="M2.5 20 12 18.2c3-.6 5-2.8 5.6-6.2" />
          <Path {...s} d="M16.6 14.2 16.4 21" />
          <Circle {...s} cx={18.6} cy={8.6} r={2} />
        </>
      );
    case 'total_mobility': // a figure reaching wide, with motion arcs
      return (
        <>
          <Circle {...s} cx={12} cy={4.5} r={2} />
          <Path {...s} d="M12 6.5V14M5 8.5l7 2 7-2M12 14l-4.5 7M12 14l4.5 7" />
          <Path {...s} d="M2.5 13.5c.3-2 1-3.5 2.2-4.8M21.5 13.5c-.3-2-1-3.5-2.2-4.8" strokeWidth={1.3} />
        </>
      );
    case 'knees': // a bent leg, side on, with the knee joint circled
      return (
        <>
          <Path {...s} d="M2.5 8.5 10.8 10.4M14.2 12.6 12.8 20.5H18" />
          <Circle {...s} cx={12.8} cy={11} r={2.4} />
        </>
      );
  }
}

export default function SprintIcon({ id, size = 24, color }: { id: string; size?: number; color: string }) {
  if (!hasSprintIcon(id)) return <Ionicons name="flash-outline" size={size} color={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Shapes id={id} color={color} />
    </Svg>
  );
}
