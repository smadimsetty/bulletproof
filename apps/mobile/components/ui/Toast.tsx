// Toasts. Visual spec section 3 "Toast" + "PR celebration moment".
// ToastProvider mounts once in app/_layout.tsx; any screen calls useToast().show(...).
// Stage 1 compatibility: useToast().show(message: string) still works and `element` is null
// (the provider renders the toast globally).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, ELEVATION, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';
import { Button } from './Button';
import type { IoniconName } from './types';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'pr';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
  icon?: IoniconName;
  /** tone 'pr' only: what to celebrate. */
  pr?: { label: string; from: number; to: number; unit?: string; decimals?: number };
}

interface ActiveToast extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (toast: string | ToastOptions) => void;
}

const NOOP_API: ToastApi = { show: () => {} };
const ToastContext = createContext<ToastApi>(NOOP_API);

const PR_THROTTLE_MS = 1500;
const EXIT_MS = 160;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const idRef = useRef(0);
  const lastPrAt = useRef(0);

  const show = useCallback((input: string | ToastOptions) => {
    let opts: ToastOptions = typeof input === 'string' ? { message: input } : input;
    if (opts.tone === 'pr') {
      const now = Date.now();
      if (now - lastPrAt.current < PR_THROTTLE_MS) {
        // Never more than one celebration per 1.5 s: queue extras as plain success toasts.
        opts = { message: opts.message, tone: 'success', action: opts.action };
      } else {
        lastPrAt.current = now;
        haptics.pr();
      }
    } else if (opts.tone === 'danger') {
      haptics.error();
    }
    idRef.current += 1;
    setToast({ ...opts, id: idRef.current });
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);
  const clear = useCallback((id: number) => setToast((cur) => (cur && cur.id === id ? null : cur)), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastCard key={toast.id} toast={toast} onDone={clear} /> : null}
    </ToastContext.Provider>
  );
}

/** Stage 1 API: `show` (string or options) and `element` (always null now; provider renders). */
export function useToast(): { show: (toast: string | ToastOptions) => void; element: ReactElement | null } {
  const { show } = useContext(ToastContext);
  return useMemo(() => ({ show, element: null }), [show]);
}

const TONE_ICON: Record<ToastTone, { icon?: IoniconName; color: string }> = {
  neutral: { color: COLORS.textSecondary },
  success: { icon: 'checkmark-circle', color: COLORS.success },
  danger: { icon: 'alert-circle', color: COLORS.danger },
  pr: { icon: 'trophy', color: COLORS.accent },
};

function ToastCard({ toast, onDone }: { toast: ActiveToast; onDone: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const tone = toast.tone ?? 'neutral';
  const isPr = tone === 'pr' && !!toast.pr;
  const hold = isPr ? 3000 : tone === 'danger' && toast.action ? 5000 : MOTION.toastHold;

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dismissedRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    progress.value = withTiming(0, { duration: reduced ? 150 : EXIT_MS, easing: MOTION.easeIn });
    timers.current.push(setTimeout(() => onDone(toast.id), (reduced ? 150 : EXIT_MS) + 20));
  }, [progress, reduced, onDone, toast.id]);

  useEffect(() => {
    if (reduced) progress.value = withTiming(1, { duration: 150 });
    else if (isPr) progress.value = withSpring(1, { ...MOTION.popSpring });
    else progress.value = withTiming(1, { duration: MOTION.base, easing: MOTION.easeOut });
    timers.current.push(setTimeout(dismiss, hold));
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          dragY.value = Math.min(0, g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -24 || g.vy < -0.5) dismissRef.current();
          dragY.value = withTiming(0, { duration: MOTION.fast });
        },
      }),
    [dragY]
  );

  const animated = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: Math.min(1, Math.max(0, p)),
      transform: reduced
        ? []
        : [
            { translateY: interpolate(p, [0, 1], [-24, 0]) + dragY.value },
            { scale: isPr ? interpolate(p, [0, 1], [0.9, 1]) : 1 },
          ],
    };
  });

  const t = TONE_ICON[tone];
  const icon = toast.icon ?? t.icon;
  const iconColor = toast.icon && tone === 'neutral' ? COLORS.textSecondary : t.color;

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 56 }]}>
      <Animated.View
        {...pan.panHandlers}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.card,
          isPr ? [ELEVATION.glow, styles.prBorder] : null,
          { maxWidth: width - SPACING.xxl },
          animated,
        ]}
      >
        {isPr && toast.pr ? (
          <>
            <View style={styles.prIconWrap}>
              <View style={styles.prCircle}>
                <Ionicons name="trophy" size={24} color={COLORS.accent} />
              </View>
              {!reduced ? <Burst seed={toast.id} /> : null}
            </View>
            <View style={styles.flex}>
              <Text style={[TYPE.overline, { color: COLORS.accent }]}>New PR</Text>
              <Text style={TYPE.callout} numberOfLines={1}>
                {toast.pr.label}
              </Text>
              <View style={styles.prValueRow}>
                <AnimatedNumber value={toast.pr.to} from={toast.pr.from} decimals={toast.pr.decimals} style={styles.prValue} />
                {toast.pr.unit ? <Text style={[TYPE.title3, { color: COLORS.textSecondary }]}>{toast.pr.unit}</Text> : null}
                <Text style={[TYPE.footnote, styles.struck]}>{`${toast.pr.from}${toast.pr.unit ?? ''}`}</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={20} color={iconColor} /> : null}
            <Text style={[TYPE.callout, styles.message, { color: COLORS.textPrimary }]} numberOfLines={3}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Button
                title={toast.action.label}
                variant="ghost"
                size="sm"
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
              />
            ) : null}
          </>
        )}
      </Animated.View>
    </View>
  );
}

// PR confetti: 10 small accent/white rects radiate from the trophy over 500 ms.
function Burst({ seed }: { seed: number }) {
  const particles = useMemo(() => {
    let s = (seed * 9301 + 49297) % 233280;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return Array.from({ length: 10 }, (_, i) => ({
      angle: ((i + rand() * 0.6) / 10) * Math.PI * 2,
      distance: 40 + rand() * 30,
      color: i % 2 === 0 ? COLORS.accent : COLORS.textPrimary,
    }));
  }, [seed]);
  return (
    <View pointerEvents="none" style={styles.burst}>
      {particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
    </View>
  );
}

function Particle({ angle, distance, color }: { angle: number; distance: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 500, easing: MOTION.easeOut });
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * distance * p.value },
      { translateY: Math.sin(angle) * distance * p.value },
      { rotate: `${angle}rad` },
    ],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.sheet,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginHorizontal: SPACING.lg,
    ...ELEVATION[3],
  },
  prBorder: { borderLeftWidth: 2, borderLeftColor: COLORS.accent },
  message: { flexShrink: 1 },
  flex: { flex: 1 },
  prIconWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  prCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accentTint, alignItems: 'center', justifyContent: 'center' },
  prValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs },
  prValue: { ...TYPE.numeral, fontSize: 32, lineHeight: 36 },
  struck: { textDecorationLine: 'line-through', marginLeft: SPACING.sm },
  burst: { position: 'absolute', left: 20, top: 20, width: 0, height: 0 },
  particle: { position: 'absolute', width: 6, height: 3, borderRadius: 1.5, left: -3, top: -1.5 },
});
