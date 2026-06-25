// Mid-session "How did that feel?" 1-10 picker, visually mirroring
// components/PainEntryRow.tsx's stepped severity-button row (same shape,
// different concern -- PainEntryRow is pain-entry-specific with a
// body_part label/note/remove action, none of which applies here, so
// this is its own small component rather than a reuse of PainEntryRow
// itself). Tapping a number calls onSelect immediately -- autosave on
// tap, same as every other single-tap control in this phase. See design
// spec Decision 9.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles } from '../lib/theme';

export interface FeltRatingPickerProps {
  readonly value: number | null;
  readonly onSelect: (rating: number) => void;
}

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function FeltRatingPicker({ value, onSelect }: FeltRatingPickerProps) {
  return (
    <View style={[sharedStyles.card, styles.container]}>
      <Text style={sharedStyles.sectionTitle}>How did that feel?</Text>
      <View style={styles.row}>
        {RATINGS.map((rating) => {
          const active = value === rating;
          return (
            <Pressable
              key={rating}
              style={[styles.button, active && styles.buttonActive]}
              onPress={() => onSelect(rating)}
              accessibilityLabel={`Felt rating ${rating}`}
            >
              <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{rating}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  button: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  buttonText: { color: COLORS.ink, fontWeight: '600' },
  buttonTextActive: { color: COLORS.card },
});
