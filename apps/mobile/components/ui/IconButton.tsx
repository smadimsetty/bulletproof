// Visual spec section 3 "IconButton".
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII } from '../../lib/theme';
import { PressableScale } from './PressableScale';
import { Badge } from './Badge';
import type { IoniconName } from './types';

export interface IconButtonProps {
  icon: IoniconName;
  onPress: () => void;
  size?: 'sm' | 'md';
  variant?: 'plain' | 'filled' | 'accent';
  badge?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  onPress,
  size = 'md',
  variant = 'plain',
  badge,
  accessibilityLabel,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  const box = size === 'sm' ? 36 : 44;
  const bg = variant === 'filled' ? COLORS.elevated : variant === 'accent' ? COLORS.accent : 'transparent';
  const fg = variant === 'accent' ? COLORS.onAccent : COLORS.textPrimary;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      hitSlop={size === 'sm' ? 4 : 0}
      style={[styles.base, { width: box, height: box, borderRadius: RADII.pill, backgroundColor: bg }, style]}
    >
      <Ionicons name={icon} size={size === 'sm' ? 18 : 20} color={fg} />
      {badge != null && badge > 0 ? (
        <View style={styles.badge} pointerEvents="none">
          <Badge count={badge} tone="danger" />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2 },
});
