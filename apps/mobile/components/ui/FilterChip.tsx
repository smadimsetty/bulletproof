// Visual spec section 3 "FilterChip" (+ FilterChipRow).
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import { PressableScale } from './PressableScale';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  count?: number;
  testID?: string;
}

export function FilterChip({ label, selected, onToggle, count, testID }: FilterChipProps) {
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(selected ? 1 : 0, { duration: MOTION.fast });
  }, [selected, p]);
  const colors = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [COLORS.elevated, COLORS.accentTint]),
    borderColor: interpolateColor(p.value, [0, 1], [COLORS.border, COLORS.accent]),
  }));

  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      accessibilityState={{ selected }}
      haptic="select"
      onPress={onToggle}
      style={styles.hit}
    >
      <Animated.View style={[styles.chip, colors]}>
        {selected ? <Ionicons name="checkmark" size={14} color={COLORS.accent} /> : null}
        <Text style={[TYPE.callout, styles.label, { color: selected ? COLORS.accent : COLORS.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        {count != null ? <Text style={[TYPE.caption, { color: selected ? COLORS.accent : COLORS.textTertiary }]}>{count}</Text> : null}
      </Animated.View>
    </PressableScale>
  );
}

/** Horizontal scrolling row of FilterChips, gutter 16, gap 8. */
export function FilterChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  label: { fontWeight: '600' },
  row: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, alignItems: 'center' },
});
