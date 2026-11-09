// Visual spec section 3 "Button".
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ELEVATION, RADII, SIZES, SPACING, TYPE } from '../../lib/theme';
import { PressableScale } from './PressableScale';
import type { IoniconName } from './types';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: IoniconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** destructive only: the filled "confirm" form (danger bg, onDanger label). */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const HEIGHT = { sm: SIZES.buttonSm, md: SIZES.buttonMd, lg: SIZES.buttonLg } as const;
const PAD_X = { sm: 14, md: 18, lg: 22 } as const;

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  solid = false,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [lockedWidth, setLockedWidth] = useState<number | undefined>(undefined);

  let bg: string = 'transparent';
  let fg: string = COLORS.textPrimary;
  let borderColor: string | undefined;
  if (variant === 'primary') {
    bg = pressed ? COLORS.accentPressed : COLORS.accent;
    fg = COLORS.onAccent;
  } else if (variant === 'secondary') {
    bg = COLORS.elevated;
    fg = COLORS.textPrimary;
    borderColor = COLORS.border;
  } else if (variant === 'ghost') {
    bg = pressed ? COLORS.accentTint : 'transparent';
    fg = COLORS.accent;
  } else {
    bg = solid ? COLORS.danger : COLORS.dangerTint;
    fg = solid ? COLORS.onDanger : COLORS.danger;
  }

  const labelStyle = size === 'sm' ? TYPE.callout : size === 'lg' ? { ...TYPE.bodyStrong, fontSize: 17 } : TYPE.bodyStrong;
  const iconSize = size === 'sm' ? 16 : 18;
  const glyph = icon ? <Ionicons name={icon} size={iconSize} color={fg} /> : null;

  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      haptic={loading ? 'none' : variant === 'primary' ? 'primary' : 'tap'}
      onPress={() => {
        if (!loading) onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PAD_X[size],
          backgroundColor: bg,
          borderColor,
          borderWidth: borderColor ? 1 : 0,
        },
        fullWidth ? styles.fullWidth : null,
        loading && lockedWidth ? { width: lockedWidth } : null,
        size === 'lg' && variant === 'primary' && !disabled ? ELEVATION.glow : null,
        style,
      ]}
    >
      <View
        style={styles.content}
        onLayout={(e) => {
          if (!loading) setLockedWidth(e.nativeEvent.layout.width + PAD_X[size] * 2 + (borderColor ? 2 : 0));
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <>
            {iconPosition === 'left' ? glyph : null}
            <Text style={[labelStyle, { color: fg }]} numberOfLines={1}>
              {title}
            </Text>
            {iconPosition === 'right' ? glyph : null}
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
});
