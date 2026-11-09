// Display-only chip. Visual spec section 3 "Chip".
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, TYPE } from '../../lib/theme';
import type { IoniconName, Tone } from './types';

export interface ChipProps {
  label: string;
  icon?: IoniconName;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: COLORS.elevated, fg: COLORS.textSecondary },
  accent: { bg: COLORS.accentTint, fg: COLORS.accent },
  success: { bg: COLORS.successTint, fg: COLORS.success },
  warning: { bg: COLORS.warningTint, fg: COLORS.warning },
  danger: { bg: COLORS.dangerTint, fg: COLORS.danger },
};

export function Chip({ label, icon, tone = 'neutral', style }: ChipProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={14} color={t.fg} /> : null}
      <Text style={[TYPE.callout, styles.label, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: RADII.pill,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
