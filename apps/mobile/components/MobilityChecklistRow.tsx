// One checkbox row for a mobility/balance exercise -- ticking it
// immediately upserts an exercise_logs row (completed: true/false) and
// fires a haptic tick, per the v2 design spec's "incremental save" and
// "haptic tick on every completion" requirements. No reps/weight inputs
// -- a mobility checklist item has no set concept (set_number stays
// null throughout, per exerciseLogs.ts's upsert-key design).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { upsertExerciseLog } from '../lib/exerciseLogs';
import type { LoggerExercise } from '../lib/loggerBlock';
import type { SessionType } from '../lib/recommendations';

export interface MobilityChecklistRowProps {
  readonly exercise: LoggerExercise;
  readonly blockType: SessionType;
  readonly initiallyCompleted: boolean;
  readonly onSwap: () => void;
  readonly onRemove: () => void;
}

export default function MobilityChecklistRow({
  exercise,
  blockType,
  initiallyCompleted,
  onSwap,
  onRemove,
}: MobilityChecklistRowProps) {
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [saving, setSaving] = useState(false);

  async function handleToggle() {
    const next = !completed;
    setCompleted(next);
    setSaving(true);

    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics failure (e.g. low-power mode) must never block the log
      // write -- see design spec Decision 8.
    }

    try {
      await upsertExerciseLog({
        date: new Date(),
        recommendationBlockExerciseId: exercise.id,
        exerciseId: exercise.exerciseId,
        blockType,
        setNumber: null,
        completed: next,
        repsCompleted: null,
        weightKg: null,
      });
    } catch {
      // Revert the optimistic toggle on failure -- the user's tap did
      // not actually persist.
      setCompleted(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[sharedStyles.card, styles.container]}>
      <Pressable style={styles.row} onPress={handleToggle} disabled={saving}>
        <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
          {completed && <Text style={styles.checkmark}>{'✓'}</Text>}
        </View>
        <View style={styles.labelColumn}>
          <Text style={TYPE.body}>{exercise.name}</Text>
          {(exercise.prescribedReps || exercise.prescribedSets != null) && (
            <Text style={sharedStyles.helperText}>
              {exercise.prescribedSets != null && exercise.prescribedReps
                ? `${exercise.prescribedSets} x ${exercise.prescribedReps}`
                : exercise.prescribedReps ?? `${exercise.prescribedSets} sets`}
            </Text>
          )}
        </View>
      </Pressable>
      <View style={styles.actionRow}>
        <Pressable onPress={onSwap} accessibilityLabel={`Swap ${exercise.name}`}>
          <Text style={styles.actionText}>{'⇄'} Swap</Text>
        </Pressable>
        <Pressable onPress={onRemove} accessibilityLabel={`Remove ${exercise.name}`}>
          <Text style={styles.removeText}>{'✕'} Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkmark: { color: COLORS.card, fontWeight: '700' },
  labelColumn: { flex: 1, gap: 2 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  actionText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  removeText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
});
