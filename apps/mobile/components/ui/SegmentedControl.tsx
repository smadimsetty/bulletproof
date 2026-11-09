// Visual spec section 3 "SegmentedControl".
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as haptics from '../../lib/haptics';
import { COLORS, ELEVATION, MOTION, RADII, TYPE } from '../../lib/theme';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PAD = 3;

export function SegmentedControl<T extends string = string>({ options, value, onChange, size = 'md', style, testID }: SegmentedControlProps<T>) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const segW = options.length > 0 ? Math.max(0, (width - PAD * 2) / options.length) : 0;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);

  useEffect(() => {
    const target = index * segW;
    if (reduced || width === 0) x.value = withTiming(target, { duration: 150 });
    else x.value = withSpring(target, { ...MOTION.spring });
  }, [index, segW, width, reduced, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const h = size === 'sm' ? 32 : 36;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[styles.track, { height: h }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? <Animated.View style={[styles.thumb, ELEVATION[1], { width: segW, height: h - PAD * 2 }, thumb]} /> : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: !!o.disabled }}
            disabled={o.disabled}
            style={styles.segment}
            onPress={() => {
              if (selected) return;
              haptics.select();
              onChange(o.value);
            }}
          >
            <Text
              style={[
                TYPE.callout,
                styles.label,
                { color: o.disabled ? COLORS.textDisabled : selected ? COLORS.textPrimary : COLORS.textTertiary },
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: COLORS.elevated, borderRadius: RADII.md, padding: PAD },
  thumb: { position: 'absolute', left: PAD, top: PAD, backgroundColor: COLORS.sheet, borderRadius: RADII.sm },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600' },
});
