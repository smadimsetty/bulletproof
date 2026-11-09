// Visual spec section 3 "Stepper". Long-press repeats every 120 ms after 400 ms.
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, RADII, SPACING, TYPE } from '../../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';
import { PressableScale } from './PressableScale';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  /** Must be a worklet (see AnimatedNumber). */
  format?: (n: number) => string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Stepper({ value, min, max, step = 1, onChange, format, style, testID }: StepperProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const repeatDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (repeatDelay.current) clearTimeout(repeatDelay.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatDelay.current = null;
    repeatTimer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const nudge = useCallback(
    (dir: 1 | -1, fromRepeat: boolean) => {
      const next = Math.min(max, Math.max(min, valueRef.current + dir * step));
      if (next === valueRef.current) {
        haptics.warning();
        stop();
        return;
      }
      valueRef.current = next;
      onChange(next);
      if (fromRepeat) haptics.select();
    },
    [max, min, step, onChange, stop]
  );

  const startRepeat = (dir: 1 | -1) => {
    stop();
    repeatDelay.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => nudge(dir, true), 120);
    }, 400);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View testID={testID} style={[styles.row, style]}>
      <StepButton icon="remove" label="Decrease" atBound={atMin} onStep={() => nudge(-1, false)} onHoldStart={() => startRepeat(-1)} onHoldEnd={stop} />
      <View style={styles.value}>
        <AnimatedNumber
          value={value}
          format={format}
          duration={200}
          animateOnMount={false}
          style={[TYPE.numeral, styles.valueText]}
        />
      </View>
      <StepButton icon="add" label="Increase" atBound={atMax} onStep={() => nudge(1, false)} onHoldStart={() => startRepeat(1)} onHoldEnd={stop} />
    </View>
  );
}

function StepButton({
  icon,
  label,
  atBound,
  onStep,
  onHoldStart,
  onHoldEnd,
}: {
  icon: 'add' | 'remove';
  label: string;
  atBound: boolean;
  onStep: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      // Bound state is visual + warning haptic, not `disabled`, so the press can still answer.
      haptic="none"
      delayLongPress={400}
      onPress={() => {
        if (atBound) haptics.warning();
        else {
          haptics.select();
          onStep();
        }
      }}
      onLongPress={() => {}}
      onPressIn={() => {
        if (!atBound) onHoldStart();
      }}
      onPressOut={onHoldEnd}
      style={[styles.button, atBound ? { opacity: 0.4 } : null]}
    >
      <Ionicons name={icon} size={20} color={COLORS.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  button: { width: 44, height: 44, borderRadius: RADII.pill, backgroundColor: COLORS.elevated, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 72, alignItems: 'center' },
  valueText: { textAlign: 'center', minWidth: 72, color: COLORS.textPrimary },
});
