// Visual spec section 3 "Badge": dot, count, or small label tag.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, TYPE } from '../../lib/theme';
import type { IoniconName } from './types';

export interface BadgeProps {
  count?: number;
  dot?: boolean;
  /** 'tint' = accentTint bg / accent text (e.g. the "Sprint" tag). */
  tone?: 'accent' | 'danger' | 'neutral' | 'tint';
  label?: string;
  icon?: IoniconName;
  style?: StyleProp<ViewStyle>;
}

const TONES = {
  accent: { bg: COLORS.accent, fg: COLORS.onAccent },
  danger: { bg: COLORS.danger, fg: COLORS.onDanger },
  neutral: { bg: COLORS.elevated, fg: COLORS.textSecondary },
  tint: { bg: COLORS.accentTint, fg: COLORS.accent },
} as const;

export function Badge({ count, dot, tone, label, icon, style }: BadgeProps) {
  if (dot) {
    const t = TONES[tone ?? 'danger'];
    return <View style={[styles.dot, { backgroundColor: t.bg }, style]} />;
  }
  if (label != null) {
    const t = TONES[tone ?? 'neutral'];
    return (
      <View style={[styles.label, { backgroundColor: t.bg }, style]}>
        {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
        <Text style={[TYPE.caption, styles.bold, { color: t.fg }]}>{label}</Text>
      </View>
    );
  }
  if (count == null || count <= 0) return null;
  // Unread counts are danger; neutral counts are accent (spec).
  const t = TONES[tone ?? 'danger'];
  return (
    <View style={[styles.count, { backgroundColor: t.bg }, style]}>
      <Text style={[TYPE.caption, styles.bold, { color: t.fg }]}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: RADII.pill },
  count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: RADII.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: RADII.pill,
    alignSelf: 'flex-start',
  },
  bold: { fontWeight: '700' },
});
