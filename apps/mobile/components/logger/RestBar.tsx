import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING, TYPE } from '../../lib/theme';
import { formatSeconds } from '../../lib/setFormatting';

export interface RestBarProps {
  remainingS: number;
  onMinus: () => void;
  onPlus: () => void;
  onSkip: () => void;
}

export default function RestBar({ remainingS, onMinus, onPlus, onSkip }: RestBarProps) {
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>{`Rest ${formatSeconds(remainingS)}`}</Text>
      <View style={styles.buttons}>
        <Pressable style={styles.btn} onPress={onMinus} hitSlop={6}>
          <Text style={styles.btnText}>−15</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={onPlus} hitSlop={6}>
          <Text style={styles.btnText}>+15</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={onSkip} hitSlop={6}>
          <Text style={styles.btnText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.ink,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: { ...TYPE.sectionTitle, color: '#FFFFFF' },
  buttons: { flexDirection: 'row', gap: SPACING.sm },
  btn: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.chip,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  btnText: { ...TYPE.label, color: '#FFFFFF' },
});
