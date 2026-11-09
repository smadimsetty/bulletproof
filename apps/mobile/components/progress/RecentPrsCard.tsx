// apps/mobile/components/progress/RecentPrsCard.tsx
//
// PRs from the last 30 days, newest first, at most 5 (visual spec 4.9 section 4).
// "See all" opens a Sheet with every PR. Tapping a row opens the exercise detail.
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SPACING, TYPE } from '../../lib/theme';
import type { PrEvent } from '../../lib/stats/prs';
import { PR_KIND_LABEL, formatPrValue, shortDate, sideSuffix } from '../../lib/stats/format';
import type { WeightUnit } from '../../lib/units';
import { Card, EmptyState, ListGroup, ListRow, SectionHeader, Sheet } from '../ui';

const DAY_MS = 24 * 60 * 60 * 1000;

export function recentPrs(events: readonly PrEvent[], now: Date, days = 30, max = 5): PrEvent[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return events
    .filter((e) => new Date(e.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, max);
}

function PrRow({ e, weightUnit, onPress }: { e: PrEvent; weightUnit: WeightUnit; onPress: () => void }) {
  // Weight tie-break (same weight, more reps): show reps on both sides.
  const tie = e.kind === 'heaviest_weight' && e.value === e.previous;
  return (
    <ListRow
      title={e.exerciseName}
      subtitle={`${PR_KIND_LABEL[e.kind]}${sideSuffix(e.side)} · ${shortDate(e.at)}`}
      leading={
        <View style={styles.trophy}>
          <Ionicons name="trophy" size={18} color={COLORS.accent} />
        </View>
      }
      trailing={
        <View style={styles.value}>
          <Text style={[TYPE.stat, styles.valueText]} numberOfLines={1}>
            {formatPrValue(e.kind, e.value, e.unit, weightUnit, tie ? e.reps : undefined)}
          </Text>
          <Text style={TYPE.footnote} numberOfLines={1}>
            {`↑ from ${formatPrValue(e.kind, e.previous, e.unit, weightUnit, tie ? e.previousReps : undefined)}`}
          </Text>
        </View>
      }
      onPress={onPress}
    />
  );
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
  const [allOpen, setAllOpen] = useState(false);
  const rows = recentPrs(events, now);
  const all = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close the sheet first; iOS drops a push that lands while a modal is still up.
  function openFromSheet(id: string) {
    setAllOpen(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onOpenExercise(id), 300);
  }

  const key = (e: PrEvent) => `${e.workoutId}-${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Recent PRs"
        inset={SPACING.xs}
        action={all.length > rows.length ? { label: 'See all', onPress: () => setAllOpen(true) } : undefined}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState compact icon="trophy-outline" title="No PRs yet" body="Beat a previous hold, rep or ROM and it shows up here." />
        </Card>
      ) : (
        <ListGroup>
          {rows.map((e) => (
            <PrRow key={key(e)} e={e} weightUnit={weightUnit} onPress={() => onOpenExercise(e.exerciseId)} />
          ))}
        </ListGroup>
      )}
      <Sheet visible={allOpen} onClose={() => setAllOpen(false)} title="Personal records" snap="tall">
        <ListGroup>
          {all.map((e) => (
            <PrRow key={key(e)} e={e} weightUnit={weightUnit} onPress={() => openFromSheet(e.exerciseId)} />
          ))}
        </ListGroup>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.xs },
  trophy: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { alignItems: 'flex-end', flexShrink: 1 },
  valueText: { fontSize: 17, lineHeight: 22 },
});
