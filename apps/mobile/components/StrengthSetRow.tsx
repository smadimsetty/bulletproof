// One strength/plyometric exercise's set list: each set is a row of
// reps + weight inputs plus a completed checkbox, with a "+ add set"
// affordance below and swipe-left-to-delete on each individual set. A
// set is upserted to exercise_logs on blur of its reps/weight field, or
// immediately when the completed checkbox is tapped (a bodyweight set
// with no weight entered is still loggable) -- per the v2 design spec's
// Decision 3 distinction between autosave-on-change controls and
// explicit-commit-on-blur text fields. Defaults the initial set count to
// the exercise's prescribed_sets (falling back to 1 if null) so the row
// isn't empty on first render.
//
// `setNumber` is a stable per-slot id, not a display position -- adding
// a set always picks max(existing setNumbers) + 1, and deleting a set
// never renumbers the rest, so a mid-list delete can't silently
// reassign a different set's saved log to a new number.
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { deleteExerciseLog, upsertExerciseLog } from '../lib/exerciseLogs';
import { displayUnitToKg, formatWeightForDisplay } from '../lib/units';
import SwipeToDelete from './SwipeToDelete';
import type { LoggerExercise } from '../lib/loggerBlock';
import type { ExerciseLogRow } from '../lib/exerciseLogs';
import type { SessionType } from '../lib/recommendations';
import type { WeightUnit } from '../lib/units';

export interface StrengthSetRowProps {
  readonly exercise: LoggerExercise;
  readonly blockType: SessionType;
  readonly existingLogs: readonly ExerciseLogRow[];
  readonly weightUnit: WeightUnit;
  readonly onSwap: () => void;
  readonly onRemove: () => void;
}

interface SetState {
  readonly setNumber: number;
  reps: string;
  weight: string;
  completed: boolean;
  saveError: string | null;
}

function buildInitialSets(
  exercise: LoggerExercise,
  existingLogs: readonly ExerciseLogRow[],
  weightUnit: WeightUnit
): SetState[] {
  const byNumber = new Map(existingLogs.filter((l) => l.setNumber != null).map((l) => [l.setNumber as number, l]));
  const count = Math.max(exercise.prescribedSets ?? 1, byNumber.size, 1);

  return Array.from({ length: count }, (_, index) => {
    const setNumber = index + 1;
    const existing = byNumber.get(setNumber);
    return {
      setNumber,
      reps: existing?.repsCompleted != null ? String(existing.repsCompleted) : '',
      weight: formatWeightForDisplay(existing?.weightKg ?? null, weightUnit),
      completed: existing?.completed ?? false,
      saveError: null,
    };
  });
}

async function saveSet(
  exercise: LoggerExercise,
  blockType: SessionType,
  set: SetState,
  weightUnit: WeightUnit
): Promise<void> {
  await upsertExerciseLog({
    date: new Date(),
    recommendationBlockExerciseId: exercise.recommendationBlockExerciseId,
    exerciseId: exercise.exerciseId,
    blockType,
    setNumber: set.setNumber,
    completed: set.completed,
    repsCompleted: set.reps.trim() === '' ? null : Number(set.reps),
    weightKg: set.weight.trim() === '' ? null : displayUnitToKg(Number(set.weight), weightUnit),
  });
}

export default function StrengthSetRow({
  exercise,
  blockType,
  existingLogs,
  weightUnit,
  onSwap,
  onRemove,
}: StrengthSetRowProps) {
  const [sets, setSets] = useState<SetState[]>(() => buildInitialSets(exercise, existingLogs, weightUnit));

  function updateSet(index: number, patch: Partial<SetState>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleBlur(index: number) {
    updateSet(index, { saveError: null });
    await saveSet(exercise, blockType, sets[index], weightUnit).catch((err: Error) => {
      updateSet(index, { saveError: err.message ?? 'Could not save this set.' });
    });
  }

  async function handleToggleCompleted(index: number) {
    const next = !sets[index].completed;
    updateSet(index, { completed: next, saveError: null });

    try {
      await Haptics.selectionAsync();
    } catch {
      // See design spec Decision 8 -- never block the log write.
    }

    await saveSet(exercise, blockType, { ...sets[index], completed: next }, weightUnit).catch((err: Error) => {
      updateSet(index, { completed: !next, saveError: err.message ?? 'Could not save this set.' });
    });
  }

  function handleAddSet() {
    const nextNumber = sets.length === 0 ? 1 : Math.max(...sets.map((s) => s.setNumber)) + 1;
    setSets((prev) => [...prev, { setNumber: nextNumber, reps: '', weight: '', completed: false, saveError: null }]);
  }

  async function handleDeleteSet(index: number) {
    const removed = sets[index];
    setSets((prev) => prev.filter((_, i) => i !== index));
    await deleteExerciseLog(exercise.recommendationBlockExerciseId, exercise.exerciseId, removed.setNumber).catch(() => {
      // The set is already gone from local state -- a failed delete here
      // means a stale logged row may remain server-side, but re-adding a
      // set picks a fresh setNumber (see handleAddSet), so it can't
      // collide with whatever this delete failed to remove.
    });
  }

  return (
    <View style={[sharedStyles.card, styles.container]}>
      <Text style={TYPE.body}>{exercise.name}</Text>
      {exercise.prescribedReps && (
        <Text style={sharedStyles.helperText}>Target: {exercise.prescribedReps}</Text>
      )}
      {exercise.demoVideoUrl && (
        <Pressable onPress={() => Linking.openURL(exercise.demoVideoUrl!).catch(() => {})}>
          <Text style={styles.demoLink}>Watch demo</Text>
        </Pressable>
      )}

      {sets.map((set, index) => (
        <SwipeToDelete key={set.setNumber} onDelete={() => handleDeleteSet(index)}>
          <View style={styles.setRow}>
            <Text style={styles.setLabel}>Set {set.setNumber}</Text>
            <TextInput
              style={[sharedStyles.textInput, styles.input]}
              keyboardType="number-pad"
              placeholder="reps"
              value={set.reps}
              onChangeText={(text) => updateSet(index, { reps: text })}
              onBlur={() => handleBlur(index)}
            />
            <TextInput
              style={[sharedStyles.textInput, styles.input]}
              keyboardType="decimal-pad"
              placeholder={weightUnit}
              value={set.weight}
              onChangeText={(text) => updateSet(index, { weight: text })}
              onBlur={() => handleBlur(index)}
            />
            <Pressable
              style={[styles.checkbox, set.completed && styles.checkboxChecked]}
              onPress={() => handleToggleCompleted(index)}
              accessibilityLabel={`Mark set ${set.setNumber} complete`}
            >
              {set.completed && <Text style={styles.checkmark}>{'✓'}</Text>}
            </Pressable>
          </View>
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
  setLabel: { ...TYPE.helper, width: 48 },
  input: { flex: 1, paddingVertical: SPACING.xs },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkmark: { color: COLORS.card, fontWeight: '700' },
  demoLink: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  addSetText: { color: COLORS.accent, fontWeight: '600' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  actionText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  removeText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
});
