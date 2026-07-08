// One mobility/balance exercise's set list, matching StrengthSetRow's
// shape: one checkbox row per set (sized from prescribedSets, or from
// however many sets already have logged rows -- see buildInitialSets),
// with a "+ add set" affordance and swipe-left-to-delete per set. No
// reps/weight inputs -- a mobility set only ever tracks "done" (set_number
// is still a real per-slot id here, same non-renumbering-on-delete
// contract as StrengthSetRow, just with completed as the only field).
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { deleteExerciseLog, upsertExerciseLog } from '../lib/exerciseLogs';
import SwipeToDelete from './SwipeToDelete';
import type { LoggerExercise } from '../lib/loggerBlock';
import type { ExerciseLogRow } from '../lib/exerciseLogs';
import type { SessionType } from '../lib/recommendations';

export interface MobilityChecklistRowProps {
  readonly exercise: LoggerExercise;
  readonly blockType: SessionType;
  readonly existingLogs: readonly ExerciseLogRow[];
  readonly onSwap: () => void;
  readonly onRemove: () => void;
}

interface SetState {
  readonly setNumber: number;
  completed: boolean;
  saveError: string | null;
}

function buildInitialSets(exercise: LoggerExercise, existingLogs: readonly ExerciseLogRow[]): SetState[] {
  const byNumber = new Map(existingLogs.filter((l) => l.setNumber != null).map((l) => [l.setNumber as number, l]));
  const count = Math.max(exercise.prescribedSets ?? 1, byNumber.size, 1);

  return Array.from({ length: count }, (_, index) => {
    const setNumber = index + 1;
    const existing = byNumber.get(setNumber);
    return {
      setNumber,
      completed: existing?.completed ?? false,
      saveError: null,
    };
  });
}

async function saveSet(exercise: LoggerExercise, blockType: SessionType, set: SetState): Promise<void> {
  await upsertExerciseLog({
    date: new Date(),
    recommendationBlockExerciseId: exercise.recommendationBlockExerciseId,
    exerciseId: exercise.exerciseId,
    blockType,
    setNumber: set.setNumber,
    completed: set.completed,
    repsCompleted: null,
    weightKg: null,
  });
}

export default function MobilityChecklistRow({
  exercise,
  blockType,
  existingLogs,
  onSwap,
  onRemove,
}: MobilityChecklistRowProps) {
  const [sets, setSets] = useState<SetState[]>(() => buildInitialSets(exercise, existingLogs));

  function updateSet(index: number, patch: Partial<SetState>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleToggleCompleted(index: number) {
    const next = !sets[index].completed;
    updateSet(index, { completed: next, saveError: null });

    try {
      await Haptics.selectionAsync();
    } catch {
      // Haptics failure (e.g. low-power mode) must never block the log
      // write -- see design spec Decision 8.
    }

    await saveSet(exercise, blockType, { ...sets[index], completed: next }).catch((err: Error) => {
      updateSet(index, { completed: !next, saveError: err.message ?? 'Could not save this set.' });
    });
  }

  function handleAddSet() {
    const nextNumber = sets.length === 0 ? 1 : Math.max(...sets.map((s) => s.setNumber)) + 1;
    setSets((prev) => [...prev, { setNumber: nextNumber, completed: false, saveError: null }]);
  }

  async function handleDeleteSet(index: number) {
    const removed = sets[index];
    setSets((prev) => prev.filter((_, i) => i !== index));
    await deleteExerciseLog(exercise.recommendationBlockExerciseId, exercise.exerciseId, removed.setNumber).catch(() => {
      // Same reasoning as StrengthSetRow.handleDeleteSet -- a failed
      // delete can't collide with a later add, which always picks a
      // fresh setNumber.
    });
  }

  return (
    <View style={[sharedStyles.card, styles.container]}>
      <Text style={TYPE.body}>{exercise.name}</Text>
      {(exercise.prescribedReps || exercise.prescribedSets != null) && (
        <Text style={sharedStyles.helperText}>
          {exercise.prescribedSets != null && exercise.prescribedReps
            ? `${exercise.prescribedSets} x ${exercise.prescribedReps}`
            : exercise.prescribedReps ?? `${exercise.prescribedSets} sets`}
        </Text>
      )}
      {exercise.demoVideoUrl && (
        <Pressable onPress={() => Linking.openURL(exercise.demoVideoUrl!).catch(() => {})}>
          <Text style={styles.demoLink}>Watch demo</Text>
        </Pressable>
      )}

      {sets.map((set, index) => (
        <SwipeToDelete key={set.setNumber} onDelete={() => handleDeleteSet(index)}>
          <Pressable style={styles.setRow} onPress={() => handleToggleCompleted(index)}>
            <View style={[styles.checkbox, set.completed && styles.checkboxChecked]}>
              {set.completed && <Text style={styles.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={styles.setLabel}>Set {set.setNumber}</Text>
          </Pressable>
          {set.saveError && <Text style={sharedStyles.warningText}>{set.saveError}</Text>}
        </SwipeToDelete>
      ))}

      <Pressable onPress={handleAddSet}>
        <Text style={styles.addSetText}>+ add set</Text>
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
  setRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  setLabel: { ...TYPE.helper },
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
  demoLink: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  addSetText: { color: COLORS.accent, fontWeight: '600' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  actionText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  removeText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
});
