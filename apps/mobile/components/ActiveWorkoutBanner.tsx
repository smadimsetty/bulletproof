// apps/mobile/components/ActiveWorkoutBanner.tsx
//
// In-progress workout banner (visual spec 4.4). Rendered once by the tabs
// layout, docked above the tab bar. Tap reopens the same workout in the
// logger; the x asks (ConfirmSheet) before discarding. Nothing discards on a
// gesture.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, ELEVATION, MOTION, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../lib/theme';
import { discardWorkout, type ActiveWorkoutSummary } from '../lib/workouts';
import { ConfirmSheet, IconButton, PressableScale, useToast } from './ui';

function elapsedLabel(startedAt: string): string {
  const total = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function PulseDot() {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

export default function ActiveWorkoutBanner({
  workout,
  onDiscarded,
  bottom,
}: {
  workout: ActiveWorkoutSummary;
  onDiscarded: () => void;
  /** Distance from the bottom of the screen (tab bar height + 8). */
  bottom: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, setTick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // A fast double tap would push two logger screens.
  const lastPushRef = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function handleDiscard() {
    setDiscarding(true);
    discardWorkout(workout.id)
      .then(() => {
        setConfirming(false);
        onDiscarded();
      })
      .catch((err: any) => {
        setConfirming(false);
        toast.show({ message: err?.message ?? 'Could not discard.', tone: 'danger' });
      })
      .finally(() => setDiscarding(false));
  }

  return (
    <>
      <Animated.View
        entering={reduced ? undefined : FadeInDown.duration(MOTION.base)}
        style={[styles.container, ELEVATION[2], { bottom }]}
      >
        <View style={styles.bar} pointerEvents="none" />
        <PressableScale
          style={styles.tapArea}
          scaleTo={0.98}
          accessibilityLabel={`Resume ${workout.title}`}
          onPress={() => {
            const t = Date.now();
            if (t - lastPushRef.current < 1000) return;
            lastPushRef.current = t;
            router.push(`/workout/${workout.id}`);
          }}
        >
          <PulseDot />
          <Text style={[TYPE.bodyStrong, styles.title]} numberOfLines={1} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
            {workout.title}
          </Text>
          <Text style={styles.elapsed} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>{elapsedLabel(workout.startedAt)}</Text>
        </PressableScale>
        <IconButton icon="close" size="sm" accessibilityLabel="Discard workout" onPress={() => setConfirming(true)} />
      </Animated.View>
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Discard workout?"
        body="Every set logged in it will be deleted."
        confirmLabel="Discard"
        destructive
        loading={discarding}
        onConfirm={handleDiscard}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.sm,
    right: SPACING.sm,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.sheet,
    borderRadius: RADII.lg,
    paddingRight: SPACING.sm,
    overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.accent },
  tapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingLeft: SPACING.lg, minHeight: 52 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  title: { flex: 1 },
  elapsed: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
});
