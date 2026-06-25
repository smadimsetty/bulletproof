// Bottom-sheet drill-down for one muscle group's best lifts, ranked by
// estimated 1RM (lib/muscleGroupVolume.ts's rankBestLifts). "Show more"
// grows the visible slice of the already-fetched, already-sorted list --
// no re-query, per design spec Decision 5. Visually mirrors
// ExercisePickerSheet.tsx's bottom-sheet Modal shell.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../lib/theme';
import type { BestLiftEntry } from '../lib/muscleGroupVolume';

export interface BestLiftsSheetProps {
  readonly visible: boolean;
  readonly bodyPart: string | null;
  readonly entries: readonly BestLiftEntry[];
  readonly onClose: () => void;
}

const PAGE_SIZE = 5;

function titleCase(bodyPart: string): string {
  return bodyPart.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BestLiftsSheet({ visible, bodyPart, entries, onClose }: BestLiftsSheetProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function handleClose() {
    setVisibleCount(PAGE_SIZE);
    onClose();
  }

  const visibleEntries = entries.slice(0, visibleCount);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View style={styles.sheet}>
          <Text style={sharedStyles.sectionTitle}>Best lifts: {bodyPart ? titleCase(bodyPart) : ''}</Text>
          <ScrollView>
            {visibleEntries.map((entry, index) => (
              <View key={`${entry.date}-${entry.exerciseName}-${index}`} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={TYPE.body}>{entry.exerciseName}</Text>
                  <Text style={sharedStyles.helperText}>
                    {entry.weightKg ?? '—'} kg
                    {entry.repsCompleted != null ? ` x ${entry.repsCompleted}` : ''} · {entry.date}
                  </Text>
                </View>
                <Text style={styles.estimate}>~{Math.round(entry.estimatedOneRepMax)} kg 1RM</Text>
              </View>
            ))}
            {entries.length === 0 && <Text style={sharedStyles.helperText}>No ranked lifts in this range yet.</Text>}
            {visibleCount < entries.length && (
              <Pressable onPress={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
                <Text style={styles.showMore}>Show more</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    maxHeight: '75%',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowMain: { flex: 1, gap: 2 },
  estimate: { ...TYPE.label, color: COLORS.accent },
  showMore: { color: COLORS.accent, fontWeight: '600', textAlign: 'center', paddingVertical: SPACING.sm },
});
