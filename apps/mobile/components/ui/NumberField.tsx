// Visual spec section 3 "NumberField": TextField variant for set inputs and assessment inputs.
import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS, MOTION, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../../lib/theme';

export interface NumberFieldProps extends Omit<TextInputProps, 'style' | 'keyboardType' | 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (next: string) => void;
  /** 'set' = SetRow input (44 high, 72 wide); 'large' = assessment input (56 high, 96 wide). */
  size?: 'set' | 'large';
  unit?: string;
  align?: 'center' | 'left';
  width?: number;
  decimal?: boolean;
  /** Placeholder is typically the previous value. */
  placeholder?: string;
  hasError?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const NumberField = forwardRef<TextInput, NumberFieldProps>(function NumberField(
  { value, onChangeText, size = 'set', unit, align = 'center', width, decimal = false, placeholder, hasError, style, onFocus, onBlur, ...rest },
  ref
) {
  const focus = useSharedValue(0);
  const [, setFocused] = useState(false);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], ['rgba(0,0,0,0)', COLORS.accent]),
  }));
  const h = size === 'large' ? 56 : 44;
  const w = width ?? (size === 'large' ? 96 : 72);

  return (
    <View style={[styles.row, style]}>
      <Animated.View
        style={[styles.field, { height: h, width: w }, borderStyle, hasError ? { borderColor: COLORS.danger } : null]}
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          keyboardAppearance="dark"
          selectionColor={COLORS.accent}
          selectTextOnFocus
          maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}
          onFocus={(e) => {
            setFocused(true);
            focus.value = withTiming(1, { duration: MOTION.fast });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            focus.value = withTiming(0, { duration: MOTION.fast });
            onBlur?.(e);
          }}
          {...rest}
          style={[TYPE.stat, styles.input, { textAlign: align }]}
        />
      </Animated.View>
      {unit ? <Text style={[TYPE.callout, { color: COLORS.textTertiary }]}>{unit}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  field: {
    borderRadius: RADII.sm,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  input: { padding: 0, color: COLORS.textPrimary },
});
