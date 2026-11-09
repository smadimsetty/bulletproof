// Bottom sheet. Visual spec section 3 "Sheet".
// RN Modal (transparent, no native animation) + reanimated. Under Reduce Motion the panel
// cross-fades instead of sliding.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, ELEVATION, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  snap?: 'auto' | 'tall';
  dismissable?: boolean;
  /** Wrap children in a ScrollView (default). Pass false when children own their scrolling (FlatList). */
  scrollable?: boolean;
  testID?: string;
}

const EXIT_MS = 220;

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  snap = 'auto',
  dismissable = true,
  scrollable = true,
  testID,
}: SheetProps) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(screenH);
  const scrim = useSharedValue(0);
  const panelOpacity = useSharedValue(reduced ? 0 : 1);

  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  const animateOut = useCallback(() => {
    scrim.value = withTiming(0, { duration: MOTION.base });
    if (reduced) {
      panelOpacity.value = withTiming(0, { duration: 150 });
    } else {
      translateY.value = withTiming(screenH, { duration: EXIT_MS, easing: MOTION.easeIn });
    }
  }, [reduced, scrim, panelOpacity, translateY, screenH]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      scrim.value = withTiming(1, { duration: MOTION.base });
      if (reduced) {
        translateY.value = 0;
        panelOpacity.value = 0;
        panelOpacity.value = withTiming(1, { duration: 150 });
      } else {
        translateY.value = screenH;
        panelOpacity.value = 1;
        translateY.value = withSpring(0, { ...MOTION.sheetSpring });
      }
      return;
    }
    if (!mounted) return;
    animateOut();
    const t = setTimeout(() => setMounted(false), EXIT_MS + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = useCallback(() => {
    if (closingRef.current || !dismissableRef.current) return;
    closingRef.current = true;
    animateOut();
    setTimeout(() => onCloseRef.current(), reduced ? 150 : EXIT_MS);
  }, [animateOut, reduced]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => dismissableRef.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          translateY.value = g.dy > 0 ? g.dy : g.dy * 0.2;
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 120 || g.vy > 1.0) requestClose();
          else translateY.value = withSpring(0, { ...MOTION.sheetSpring });
        },
        onPanResponderTerminate: () => {
          translateY.value = withSpring(0, { ...MOTION.sheetSpring });
        },
      }),
    [requestClose, translateY]
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  const body = scrollable ? (
    <ScrollView
      style={snap === 'tall' ? styles.flex : styles.shrink}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      indicatorStyle="white"
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={snap === 'tall' ? styles.flex : styles.shrink}>{children}</View>
  );

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible onRequestClose={requestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.scrim }, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          testID={testID}
          style={[
            styles.panel,
            ELEVATION[2],
            snap === 'tall' ? { height: screenH * 0.9 } : { maxHeight: screenH * 0.9 },
            { paddingBottom: SPACING.lg + insets.bottom },
            panelStyle,
          ]}
        >
          <View {...pan.panHandlers}>
            <View style={styles.grabber} />
            {title || dismissable ? (
              <View style={styles.header}>
                <View style={styles.titles}>
                  {title ? (
                    <Text style={TYPE.title2} accessibilityRole="header">
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? <Text style={TYPE.footnote}>{subtitle}</Text> : null}
                </View>
                {dismissable ? <IconButton icon="close" size="sm" variant="filled" onPress={requestClose} accessibilityLabel="Close" /> : null}
              </View>
            ) : null}
          </View>
          {body}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: COLORS.sheet,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.borderStrong,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingBottom: SPACING.md },
  titles: { flex: 1, gap: 2, paddingTop: 4 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  bodyContent: { paddingBottom: SPACING.sm, gap: SPACING.md },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
});
