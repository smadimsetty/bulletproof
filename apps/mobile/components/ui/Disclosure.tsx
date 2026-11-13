// apps/mobile/components/ui/Disclosure.tsx
//
// A tappable header that shows or hides its children (a drop-down section).
// Used by the Progress tab so long lists (assessments per area, workouts per month)
// stay collapsed until asked for.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, SPACING } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import { PressableScale } from './PressableScale';

export interface DisclosureProps {
  /** The always-visible header content (left of the chevron). */
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
}

export function Disclosure({ header, children, defaultOpen = false, accessibilityLabel, style, bodyStyle }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={style}>
      <PressableScale
        onPress={() => {
          haptics.select();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <View style={styles.flex}>{header}</View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textTertiary} />
      </PressableScale>
      {open ? (
        <Animated.View entering={FadeIn.duration(MOTION.fast)} style={bodyStyle}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  flex: { flex: 1 },
});
