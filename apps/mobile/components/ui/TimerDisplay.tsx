// Visual spec section 3 "TimerDisplay": hold / rest / switch-sides presentations.
// Purely presentational: the caller owns the clock and passes elapsed/remaining. Haptics tied to
// the timer's visual beats (last 3 s, target reached, rest end, switch prompt) fire from here.
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, ELEVATION, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../../lib/theme';
import { Button } from './Button';
import { ProgressRing } from './ProgressRing';

/** m:ss, or h:mm:ss beyond an hour. Render with a tabular TYPE style. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

export interface TimerDisplayProps {
  mode: 'hold' | 'rest' | 'switch';
  /** rest / switch: time left. */
  remainingMs?: number;
  /** hold: time held so far (counts up, may exceed target). */
  elapsedMs?: number;
  /** hold: target hold; rest: total rest (for the shrinking progress line). */
  targetMs?: number;
  /** switch: which side to move to. */
  toSide?: 'LEFT' | 'RIGHT';
  onSkip?: () => void;
  onAdd15?: () => void;
  onSub15?: () => void;
  onStop?: () => void;
  /**
   * Fire the success haptic when the hold reaches target / the rest ends (default true).
   * Pass false when the caller already fires it from its own state machine (the logger does).
   * The last-3-seconds soft ticks and the switch-sides heavy tap always fire from here.
   */
  endHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TimerDisplay(props: TimerDisplayProps) {
  if (props.mode === 'hold') return <HoldTimer {...props} />;
  if (props.mode === 'rest') return <RestTimer {...props} />;
  return <SwitchTimer {...props} />;
}

function HoldTimer({ elapsedMs = 0, targetMs = 0, onStop, endHaptics = true, style, testID }: TimerDisplayProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const lastSecond = useRef(-1);
  const reachedRef = useRef(false);

  const elapsedS = Math.floor(elapsedMs / 1000);
  const targetS = Math.floor(targetMs / 1000);
  const reached = targetMs > 0 && elapsedMs >= targetMs;
  const progress = targetMs > 0 ? elapsedMs / targetMs : 0;

  useEffect(() => {
    if (elapsedS === lastSecond.current) return;
    lastSecond.current = elapsedS;
    const left = targetS - elapsedS;
    if (targetS > 0 && left >= 1 && left <= 3) {
      haptics.soft();
      if (!reduced) scale.value = withSequence(withTiming(1.06, { duration: 100 }), withTiming(1, { duration: 140 }));
    }
  }, [elapsedS, targetS, reduced, scale]);

  useEffect(() => {
    if (reached && !reachedRef.current) {
      reachedRef.current = true;
      if (endHaptics) haptics.success();
    }
    if (!reached) reachedRef.current = false;
  }, [reached]);

  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View testID={testID} style={[styles.hold, style]}>
      <ProgressRing progress={progress} size={56} stroke={6} />
      <View style={styles.holdCenter}>
        <Animated.Text
          maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}
          style={[styles.holdTime, { color: reached ? COLORS.accent : COLORS.textPrimary }, pulse]}
        >
          {formatClock(elapsedMs)}
        </Animated.Text>
        {targetMs > 0 ? (
          <Text style={[TYPE.stat, { color: COLORS.textTertiary }]} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
            {`/ ${formatClock(targetMs)}`}
          </Text>
        ) : null}
      </View>
      {onStop ? <Button title="Stop" variant="secondary" size="sm" onPress={onStop} /> : null}
    </View>
  );
}

function RestTimer({ remainingMs = 0, targetMs = 0, onSkip, onAdd15, onSub15, endHaptics = true, style, testID }: TimerDisplayProps) {
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  const endedRef = useRef(false);
  const ended = remainingMs <= 0;
  const frac = targetMs > 0 ? Math.max(0, Math.min(1, remainingMs / targetMs)) : 0;

  useEffect(() => {
    if (ended && !endedRef.current) {
      endedRef.current = true;
      if (endHaptics) haptics.success();
      flash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 120 }));
    }
    if (!ended) endedRef.current = false;
  }, [ended, flash]);

  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(flash.value, [0, 1], [COLORS.sheet, COLORS.accentTint]),
  }));

  return (
    <Animated.View
      testID={testID}
      entering={reduced ? FadeIn.duration(150) : SlideInDown.duration(200)}
      exiting={reduced ? FadeOut.duration(150) : SlideOutDown.duration(200)}
      style={[styles.rest, ELEVATION[2], bg, style]}
    >
      <View style={styles.restLeft}>
        <Text style={TYPE.overline}>Rest</Text>
        <Text style={TYPE.stat} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
          {formatClock(Math.ceil(remainingMs / 1000) * 1000)}
        </Text>
      </View>
      <View style={styles.restActions}>
        {onSub15 ? <Button title="-15" variant="ghost" size="sm" onPress={onSub15} /> : null}
        {onAdd15 ? <Button title="+15" variant="ghost" size="sm" onPress={onAdd15} /> : null}
        {onSkip ? <Button title="Skip" variant="secondary" size="sm" onPress={onSkip} /> : null}
      </View>
      <View style={styles.restLine} pointerEvents="none">
        <View style={[styles.restLineFill, { width: `${frac * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

function SwitchTimer({ remainingMs = 0, toSide = 'RIGHT', style, testID }: TimerDisplayProps) {
  useEffect(() => {
    haptics.heavy();
  }, []);
  return (
    <View testID={testID} accessibilityRole="alert" style={[styles.switch, style]}>
      <Ionicons name="swap-horizontal" size={22} color={COLORS.warning} />
      <Text style={[TYPE.title3, styles.switchTitle, { color: COLORS.warning }]}>{`Switch to ${toSide} side`}</Text>
      <Text style={TYPE.stat} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
        {Math.max(0, Math.ceil(remainingMs / 1000))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hold: { height: 96, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.sm },
  holdCenter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  holdTime: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  rest: {
    height: 64,
    marginHorizontal: SPACING.md,
    borderRadius: RADII.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    overflow: 'hidden',
  },
  restLeft: { gap: 0 },
  restActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  restLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'transparent' },
  restLineFill: { height: 4, backgroundColor: COLORS.accent },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.warningTint,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  switchTitle: { flex: 1 },
});
