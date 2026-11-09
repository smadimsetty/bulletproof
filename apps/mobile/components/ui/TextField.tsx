// Visual spec section 3 "TextField". (Landed with the step-3 sheets because ConfirmSheet needs it.)
import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import type { IoniconName } from './types';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string;
  showCount?: boolean;
  leftIcon?: IoniconName;
  /** Rendered at the right inside the field (e.g. availability status). */
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, error, multiline, maxLength, showCount, leftIcon, right, containerStyle, fieldStyle, value, onFocus, onBlur, ...rest },
  ref
) {
  const focus = useSharedValue(0);
  const [, setFocused] = useState(false);
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], ['rgba(0,0,0,0)', COLORS.accent]),
  }));
  const length = (value ?? '').length;
  const nearLimit = maxLength != null && length >= maxLength * 0.9;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[TYPE.overline, styles.label]}>{label}</Text> : null}
      <Animated.View
        style={[
          styles.field,
          multiline ? styles.multiline : null,
          borderStyle,
          error ? { borderColor: COLORS.danger } : null,
          fieldStyle,
        ]}
      >
        {leftIcon ? <Ionicons name={leftIcon} size={18} color={COLORS.textTertiary} style={styles.leftIcon} /> : null}
        <TextInput
          ref={ref}
          value={value}
          multiline={multiline}
          maxLength={maxLength}
          placeholderTextColor={COLORS.textTertiary}
          selectionColor={COLORS.accent}
          keyboardAppearance="dark"
          accessibilityLabel={rest.accessibilityLabel ?? label}
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
          style={[TYPE.body, styles.input, multiline ? styles.inputMultiline : null]}
        />
        {right}
      </Animated.View>
      {error || helper || (showCount && maxLength != null) ? (
        <View style={styles.footer}>
          <View style={styles.message}>
            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                <Text style={[TYPE.footnote, { color: COLORS.danger }]}>{error}</Text>
              </View>
            ) : helper ? (
              <Text style={TYPE.footnote}>{helper}</Text>
            ) : null}
          </View>
          {showCount && maxLength != null ? (
            <Text style={[TYPE.caption, { color: nearLimit ? COLORS.warning : COLORS.textTertiary }]}>{`${length}/${maxLength}`}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 14,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  multiline: { height: undefined, minHeight: 96, alignItems: 'flex-start', paddingVertical: SPACING.md },
  leftIcon: { marginRight: SPACING.sm },
  input: { flex: 1, padding: 0, color: COLORS.textPrimary },
  inputMultiline: { textAlignVertical: 'top', minHeight: 72 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 6, gap: SPACING.sm },
  message: { flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
