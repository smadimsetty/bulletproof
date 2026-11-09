// apps/mobile/components/Toast.tsx
//
// One toast at a time, sliding/fading in at the top of the screen it is
// rendered in and auto-hiding after 2.5s. A new show() replaces the current
// message and restarts the timer. Render `element` as the last child of a
// screen's root view.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { COLORS, RADII, SPACING } from '../lib/theme';

const VISIBLE_MS = 2500;

export function useToast(): { show: (message: string) => void; element: ReactElement | null } {
  const [message, setMessage] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, VISIBLE_MS);
    },
    [anim]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const element = useMemo(
    () =>
      message === null ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
          ]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ),
    [message, anim]
  );

  return { show, element };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.ink,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    zIndex: 100,
    elevation: 6,
  },
  text: { color: COLORS.card, fontSize: 15, fontWeight: '700' },
});
