// apps/mobile/components/progress/RecentPrsCard.tsx
//
// PRs from the last 30 days, newest first, at most 5. Tapping a row opens the
// exercise detail screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, TYPE, sharedStyles } from '../../lib/theme';
import type { PrEvent } from '../../lib/stats/prs';
import { describePrEvent, shortDate } from '../../lib/stats/format';
import type { WeightUnit } from '../../lib/units';

const DAY_MS = 24 * 60 * 60 * 1000;

export function recentPrs(events: readonly PrEvent[], now: Date, days = 30, max = 5): PrEvent[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return events
    .filter((e) => new Date(e.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, max);
}

export default function RecentPrsCard({
  events,
  weightUnit,
  now,
  onOpenExercise,
}: {
  events: readonly PrEvent[];
  weightUnit: WeightUnit;
  now: Date;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const rows = recentPrs(events, now);
  return (
    <View style={sharedStyles.card}>
      <Text style={TYPE.sectionTitle}>Personal records</Text>
      {rows.length === 0 ? (
        <Text style={sharedStyles.helperText}>No PRs yet — keep logging.</Text>
      ) : (
        rows.map((e) => (
          <Pressable
            key={`${e.workoutId}-${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`}
            style={styles.row}
            onPress={() => onOpenExercise(e.exerciseId)}
          >
            <Text style={[TYPE.body, styles.text]}>{describePrEvent(e, weightUnit)}</Text>
            <Text style={sharedStyles.helperText}>{shortDate(e.at)}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  text: { flex: 1 },
});
