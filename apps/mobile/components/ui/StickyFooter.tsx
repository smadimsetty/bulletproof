// Visual spec section 3 "Other shared pieces": StickyFooter.
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, ELEVATION, SPACING } from '../../lib/theme';

export interface StickyFooterProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StickyFooter({ children, style, testID }: StickyFooterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.footer, ELEVATION[2], { paddingBottom: SPACING.md + insets.bottom }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: COLORS.tabBar,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
});
