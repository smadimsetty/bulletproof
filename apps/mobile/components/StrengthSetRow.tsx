// One strength/plyometric exercise's set list: each set is a row of
// reps + weight inputs plus a completed checkbox, with a "+ add set"
// affordance below. A set is upserted to exercise_logs on blur of its
// reps/weight field, or immediately when the completed checkbox is
// tapped (a bodyweight set with no weight entered is still loggable) --
// per the v2 design spec's Decision 3 distinction between autosave-on-
// change controls and explicit-commit-on-blur text fields. Defaults the
// initial set count to the exercise's prescribed_sets (falling back to
// 1 if null) so the row isn't empty on first render.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { upsertExerciseLog } from '../lib/exerciseLogs';
import type { LoggerExercise } from '../lib/loggerBlock';
import type { ExerciseLogRow } from '../lib/exerciseLogs';
import type { SessionType } from '../lib/recommendations';

export interface StrengthSetRowProps {
  readonly exercise: LoggerExercise;
  readonly blockType: SessionType;
  readonly existingLogs: readonly ExerciseLogRow[];
  readonly onSwap: () => void;
  readonly onRemove: () => void;
}

interface SetState {
  readonly setNumber: number;
  reps: string;
  weight: string;
  completed: boolean;
}

function buildInitialSets(exercise: LoggerExercise, existingLogs: readonly ExerciseLogRow[]): SetState[] {
  const byNumber = new Map(existingLogs.filter((l) => l.setNumber != null).map((l) => [l.setNumber as number, l]));
  const count = Math.max(exercise.prescribedSets ?? 1, byNumber.size, 1);

  return Array.from({ length: count }, (_, index) => {
    const setNumber = index + 1;
    const existing = byNumber.get(setNumber);
    return {
      setNumber,
      reps: existing?.repsCompleted != null ? String(existing.repsCompleted) : '',
      weight: existing?.weightKg != null ? String(existing.weightKg) : '',
      completed: existing?.completed ?? false,
    };
  });
}

async function saveSet(
  exercise: LoggerExercise,
  blockType: SessionType,
  set: SetState
): Promise<void> {
  await upsertExerciseLog({
    date: new Date(),
    recommendationBlockExerciseId: exercise.id,
    exerciseId: exercise.exerciseId,
    blockType,
    setNumber: set.setNumber,
    completed: set.completed,
    repsCompleted: set.reps.trim() === '' ? null : Number(set.reps),
    weightKg: set.weight.trim() === '' ? null : Number(set.weight),
  });
}

export default function StrengthSetRow({ exercise, blockType, existingLogs, onSwap, onRemove }: StrengthSetRowProps) {
  const [sets, setSets] = useState<SetState[]>(() => buildInitialSets(exercise, existingLogs));

  function updateSet(index: number, patch: Partial<SetState>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleBlur(index: number) {
    await saveSet(exercise, blockType, sets[index]).catch(() => {
      // Best-effort: a transient save failure on blur is retried the
      // next time this field blurs or the completed checkbox is tapped,
      // not surfaced as a disruptive per-keystroke error.
    });
  }

  async function handleToggleCompleted(index: number) {
    const next = !sets[index].completed;
    updateSet(index, { completed: next });

    try {
      await Haptics.selectionAsync();
    } catch {
      // See design spec Decision 8 -- never block the log write.
    }

    await saveSet(exercise, blockType, { ...sets[index], completed: next }).catch(() => {
      updateSet(index, { completed: !next });
    });
  }

  function handleAddSet() {
    setSets((prev) => [...prev, { setNumber: prev.length + 1, reps: '', weight: '', completed: false }]);
  }

  return (
    <View style={[sharedStyles.card, styles.container]}>
      <Text style={TYPE.body}>{exercise.name}</Text>
      {exercise.prescribedReps && (
        <Text style={sharedStyles.helperText}>Target: {exercise.prescribedReps}</Text>
      )}

      {sets.map((set, index) => (
        <View key={set.setNumber} style={styles.setRow}>
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
            placeholder="kg"
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
  setRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
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
  addSetText: { color: COLORS.accent, fontWeight: '600' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  actionText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  removeText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
});
