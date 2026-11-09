// Visual spec section 3 "EmptyState".
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { Button } from './Button';
import type { IoniconName } from './types';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
  loading?: boolean;
}

export interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  body?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  /** 'danger' recolours the icon circle (used by ErrorState). */
  tone?: 'accent' | 'danger';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function EmptyState({ icon, title, body, action, secondaryAction, compact, tone = 'accent', style, testID }: EmptyStateProps) {
  const circle = compact ? 40 : 64;
  const iconSize = compact ? 20 : 28;
  const bg = tone === 'danger' ? COLORS.dangerTint : COLORS.accentTint;
  const fg = tone === 'danger' ? COLORS.danger : COLORS.accent;
  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={[styles.circle, { width: circle, height: circle, borderRadius: circle / 2, backgroundColor: bg }]}>
        <Ionicons name={icon} size={iconSize} color={fg} />
      </View>
      <View style={styles.text}>
        <Text style={[TYPE.title3, styles.center]}>{title}</Text>
        {body ? <Text style={[TYPE.callout, styles.center]}>{body}</Text> : null}
      </View>
      {action ? (
        <Button title={action.label} icon={action.icon} loading={action.loading} onPress={action.onPress} style={styles.action} />
      ) : null}
      {secondaryAction && !compact ? (
        <Button title={secondaryAction.label} icon={secondaryAction.icon} variant="ghost" onPress={secondaryAction.onPress} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'center', maxWidth: 300, gap: SPACING.sm, paddingVertical: SPACING.lg },
  circle: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  text: { alignItems: 'center', gap: SPACING.sm },
  center: { textAlign: 'center' },
  action: { marginTop: SPACING.lg - SPACING.sm },
});
