// Visual spec section 3 "ListRow" (+ ListGroup for grouped rows; SwitchRow is its own file).
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, RADII, SIZES, SPACING, TYPE } from '../../lib/theme';
import { Card } from './Card';
import { PressableScale } from './PressableScale';
import type { IoniconName, Tone } from './types';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode | { icon: IoniconName; tone?: Tone };
  trailing?: 'chevron' | 'switch' | ReactNode;
  /** Used when trailing === 'switch'. */
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const TONE_COLOR: Record<Tone, string> = {
  neutral: COLORS.textSecondary,
  accent: COLORS.accent,
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
};

function isIconLeading(l: ListRowProps['leading']): l is { icon: IoniconName; tone?: Tone } {
  return !!l && typeof l === 'object' && !isValidElement(l) && 'icon' in (l as object);
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  switchValue,
  onSwitchChange,
  value,
  onPress,
  destructive,
  disabled,
  style,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const titleColor = destructive ? COLORS.danger : COLORS.textPrimary;

  let leadingNode: ReactNode = null;
  if (isIconLeading(leading)) {
    const color = destructive ? COLORS.danger : TONE_COLOR[leading.tone ?? 'neutral'];
    leadingNode = (
      <View style={styles.leadingBox}>
        <Ionicons name={leading.icon} size={18} color={color} />
      </View>
    );
  } else if (leading != null && leading !== false) {
    leadingNode = leading as ReactNode;
  }

  const isSwitch = trailing === 'switch';
  let trailingNode: ReactNode = null;
  if (trailing === 'chevron') {
    trailingNode = <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />;
  } else if (isSwitch) {
    trailingNode = (
      <Switch
        value={!!switchValue}
        onValueChange={(next) => {
          haptics.select();
          onSwitchChange?.(next);
        }}
        disabled={disabled}
        trackColor={{ false: COLORS.borderStrong, true: COLORS.accent }}
        thumbColor="#F4F5F7"
        ios_backgroundColor={COLORS.borderStrong}
      />
    );
  } else if (trailing != null && trailing !== false) {
    trailingNode = trailing as ReactNode;
  }

  const content = (
    <>
      {leadingNode}
      <View style={styles.text}>
        <Text style={[TYPE.bodyStrong, { color: titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[TYPE.footnote, { color: COLORS.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[TYPE.callout, { color: COLORS.textTertiary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailingNode}
    </>
  );

  // The whole row toggles when it is a switch row.
  const handlePress = isSwitch && !onPress ? () => onSwitchChange?.(!switchValue) : onPress;

  if (!handlePress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} style={[styles.row, style]}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={handlePress}
      disabled={disabled}
      scaleTo={0.98}
      haptic={isSwitch ? 'select' : 'tap'}
      style={[styles.row, style]}
    >
      {content}
    </PressableScale>
  );
}

/** Rows grouped in one Card (padding 0) with hairline dividers inset 60 (leading) or 16. */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<ListRowProps>[];
  return (
    <Card padding={0} style={[styles.group, style]}>
      {rows.map((row, i) => (
        <View key={row.key ?? i}>
          {i > 0 ? (
            <View style={[styles.divider, { marginLeft: row.props && row.props.leading != null ? 60 : SPACING.lg }]} />
          ) : null}
          {row}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: SIZES.rowMin,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  leadingBox: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  group: { gap: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.divider },
});
