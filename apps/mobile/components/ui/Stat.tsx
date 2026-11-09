// Visual spec section 3 "Stat".
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, NUMERAL_MAX_FONT_SCALE, SPACING, TYPE } from '../../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';

export interface StatProps {
  value: number | string;
  label: string;
  unit?: string;
  delta?: { value: string; direction: 'better' | 'worse' | 'same' };
  size?: 'hero' | 'lg' | 'md';
  animate?: boolean;
  align?: 'left' | 'center';
  /** Decimal places when value is a number. */
  decimals?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VALUE_STYLE = { hero: TYPE.display, lg: TYPE.numeral, md: TYPE.stat } as const;

const DELTA = {
  better: { icon: 'arrow-up', color: COLORS.success },
  worse: { icon: 'arrow-down', color: COLORS.danger },
  same: { icon: 'remove', color: COLORS.textTertiary },
} as const;

export function Stat({ value, label, unit, delta, size = 'lg', animate = true, align = 'left', decimals = 0, style, testID }: StatProps) {
  const valueStyle = VALUE_STYLE[size];
  const center = align === 'center';
  return (
    <View testID={testID} style={[{ alignItems: center ? 'center' : 'flex-start' }, style]}>
      <Text style={TYPE.overline} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        {typeof value === 'number' && animate ? (
          <AnimatedNumber value={value} decimals={decimals} style={valueStyle} />
        ) : (
          <Text style={valueStyle} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
            {typeof value === 'number' ? value.toFixed(decimals) : value}
          </Text>
        )}
        {unit ? <Text style={[TYPE.title3, styles.unit, { color: COLORS.textSecondary }]}>{unit}</Text> : null}
      </View>
      {delta ? (
        <View style={styles.delta}>
          <Ionicons name={DELTA[delta.direction].icon} size={14} color={DELTA[delta.direction].color} />
          <Text style={[TYPE.callout, { fontWeight: '600', color: DELTA[delta.direction].color }]}>{delta.value}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  unit: { marginLeft: SPACING.xs },
  delta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },
});
