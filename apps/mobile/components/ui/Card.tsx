// Visual spec section 3 "Card".
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, ELEVATION, RADII, SPACING } from '../../lib/theme';
import { PressableScale } from './PressableScale';

export interface CardProps {
  children?: ReactNode;
  onPress?: () => void;
  padding?: number;
  variant?: 'default' | 'accent' | 'outline';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, padding = SPACING.lg, variant = 'default', style, testID, accessibilityLabel }: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.card,
    variant === 'outline' ? styles.outline : [ELEVATION[1], { backgroundColor: COLORS.surface }],
    variant === 'accent' ? styles.accent : null,
    { padding },
    style,
  ];
  const inner = (
    <>
      {variant === 'accent' ? <View style={styles.bar} pointerEvents="none" /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <PressableScale testID={testID} accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.98} style={base}>
        {inner}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} accessibilityLabel={accessibilityLabel} style={base}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADII.lg, gap: SPACING.md },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  accent: { borderWidth: 1, borderColor: COLORS.accent },
  bar: {
    position: 'absolute',
    left: 0,
    top: SPACING.lg,
    width: 4,
    height: 24,
    backgroundColor: COLORS.accent,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
});
