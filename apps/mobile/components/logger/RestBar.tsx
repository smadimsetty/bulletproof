// Rest timer docked above the home indicator (visual spec 3 TimerDisplay "Rest").
// Presentation over TimerDisplay; the logger owns the countdown and passes values in.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING } from '../../lib/theme';
import { TimerDisplay } from '../ui';

export interface RestBarProps {
  remainingS: number;
  /** Total rest length, for the shrinking progress line. */
  totalS?: number;
  onMinus: () => void;
  onPlus: () => void;
  onSkip: () => void;
}

export default function RestBar({ remainingS, totalS, onMinus, onPlus, onSkip }: RestBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(insets.bottom, SPACING.sm) }]}>
      <TimerDisplay
        mode="rest"
        remainingMs={remainingS * 1000}
        targetMs={(totalS ?? Math.max(remainingS, 1)) * 1000}
        onSub15={onMinus}
        onAdd15={onPlus}
        onSkip={onSkip}
        // The logger fires the rest-end success haptic from its own tick.
        endHaptics={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0 },
});
