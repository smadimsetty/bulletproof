// apps/mobile/components/progress/ConsistencyCard.tsx
//
// Weekly streak hero, best streak and this week's progress ring (visual spec 4.9).
// Tapping opens the weekly-goal sheet.
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, NUMERAL_MAX_FONT_SCALE, SPACING, TYPE } from '../../lib/theme';
import type { Consistency } from '../../lib/stats/consistency';
import { AnimatedNumber, Card, ProgressRing } from '../ui';

export default function ConsistencyCard({ consistency, onPress }: { consistency: Consistency; onPress: () => void }) {
  const { currentStreak, bestStreak, thisWeekCount, weeklyGoal } = consistency;
  const progress = weeklyGoal > 0 ? thisWeekCount / weeklyGoal : 0;
  const hasStreak = currentStreak > 0;

  return (
    <Card variant={hasStreak ? 'accent' : 'default'} onPress={onPress} accessibilityLabel="Edit weekly goal">
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={TYPE.overline}>Week streak</Text>
          <AnimatedNumber value={currentStreak} style={[TYPE.display, hasStreak ? null : { color: COLORS.textTertiary }]} />
          <Text style={TYPE.footnote} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
            {hasStreak ? `Best ${bestStreak}` : 'Finish a workout to start a streak.'}
          </Text>
        </View>
        <View style={styles.ring}>
          <ProgressRing progress={progress} size={88} stroke={10} current={thisWeekCount} total={weeklyGoal} />
          <Text style={TYPE.caption}>THIS WEEK</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  left: { flex: 1, gap: SPACING.xs },
  ring: { alignItems: 'center', gap: SPACING.sm },
});
