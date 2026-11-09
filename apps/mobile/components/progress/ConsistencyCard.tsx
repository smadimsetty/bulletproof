// apps/mobile/components/progress/ConsistencyCard.tsx
//
// Weekly streak, best streak and this week's progress ring. Tapping opens the
// weekly-goal sheet.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import type { Consistency } from '../../lib/stats/consistency';

const SIZE = 76;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export default function ConsistencyCard({
  consistency,
  hasAnyWorkout,
  onPress,
}: {
  consistency: Consistency;
  hasAnyWorkout: boolean;
  onPress: () => void;
}) {
  const { currentStreak, bestStreak, thisWeekCount, weeklyGoal } = consistency;
  const fraction = weeklyGoal > 0 ? Math.min(1, thisWeekCount / weeklyGoal) : 0;

  return (
    <Pressable style={sharedStyles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel="Edit weekly goal">
      <Text style={TYPE.sectionTitle}>Consistency</Text>
      <View style={styles.row}>
        <View style={styles.left}>
          {hasAnyWorkout || currentStreak > 0 ? (
            <>
              <Text style={styles.big}>
                {currentStreak} week{currentStreak === 1 ? '' : 's'}
              </Text>
              <Text style={sharedStyles.helperText}>current streak · best {bestStreak}</Text>
            </>
          ) : (
            <Text style={sharedStyles.helperText}>Finish a workout to start a streak.</Text>
          )}
        </View>
        <View style={styles.ringWrap}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={COLORS.accentMuted} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={COLORS.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC * fraction} ${CIRC}`}
              rotation={-90}
              originX={SIZE / 2}
              originY={SIZE / 2}
            />
          </Svg>
          <View style={styles.ringLabel} pointerEvents="none">
            <Text style={TYPE.label}>
              {thisWeekCount}/{weeklyGoal}
            </Text>
          </View>
        </View>
      </View>
      <Text style={sharedStyles.helperText}>
        This week {thisWeekCount} / {weeklyGoal} · tap to change your goal
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  left: { flex: 1, gap: SPACING.xs },
  big: { fontSize: 28, fontWeight: '700', color: COLORS.ink },
  ringWrap: { width: SIZE, height: SIZE },
  ringLabel: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
});
