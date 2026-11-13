// apps/mobile/components/TimeRangePicker.tsx
//
// Three large selectable cards, one per daily time range. Used by onboarding, the Settings
// "Daily time" sheet and the one-time prompt on the Workout tab.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { TIME_RANGE_OPTIONS, type TimeRange } from '../lib/engine/dayPlanner';
import { Card } from './ui';

interface Props {
  value: TimeRange | null;
  onSelect: (range: TimeRange) => void;
  disabled?: boolean;
}

export default function TimeRangePicker({ value, onSelect, disabled }: Props) {
  return (
    <View style={styles.list}>
      {TIME_RANGE_OPTIONS.map((o) => {
        const selected = value === o.range;
        return (
          <Card
            key={o.range}
            variant={selected ? 'accent' : 'default'}
            onPress={disabled ? undefined : () => onSelect(o.range)}
            accessibilityLabel={`${o.title}. ${o.subtitle}`}
          >
            <View style={styles.row}>
              <View style={styles.text}>
                <Text style={TYPE.bodyStrong}>{o.title}</Text>
                <Text style={TYPE.footnote}>{o.subtitle}</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={24} color={COLORS.accent} /> : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 56 },
  text: { flex: 1, gap: SPACING.xs },
});
