// Visual spec section 3 "SectionHeader".
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { PressableScale } from './PressableScale';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
  /** Horizontal inset: 16 (default) or 4 when already inside screen padding. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, action, inset = SPACING.lg, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, { paddingHorizontal: inset }, style]}>
      <Text style={TYPE.overline} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <PressableScale onPress={action.onPress} hitSlop={12} scaleTo={0.95} accessibilityLabel={action.label}>
          <Text style={[TYPE.callout, styles.action]}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  action: { fontWeight: '600', color: COLORS.accent },
});
