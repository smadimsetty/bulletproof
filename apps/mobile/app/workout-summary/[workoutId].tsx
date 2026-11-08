// apps/mobile/app/workout-summary/[workoutId].tsx
//
// Saved-workout detail (spec section 6): read-only set lines per exercise,
// with an Edit mode for title/notes and a Delete action.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { deleteWorkout, fetchWorkout, updateWorkoutMeta, type Workout } from '../../lib/workouts';
import { durationLabel } from '../../lib/historyGrouping';
import { fieldsForExercise } from '../../lib/setFields';
import { formatSetLines } from '../../lib/setFormatting';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

export default function WorkoutSummaryScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, u] = await Promise.all([fetchWorkout(workoutId), fetchWeightUnit().catch((): WeightUnit => 'lbs')]);
      setWorkout(w);
      setUnit(u);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load.');
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  // An unfinished workout belongs in the live logger, not the summary.
  useEffect(() => {
    if (workout && workout.endedAt == null) router.replace(`/workout/${workout.id}`);
  }, [workout, router]);

  function toggleEdit() {
    if (!workout) return;
    if (!editing) {
      setTitleDraft(workout.title);
      setNotesDraft(workout.notes ?? '');
    }
    setEditing(!editing);
  }

  async function handleSave() {
    if (!workout) return;
    setSaving(true);
    try {
      await updateWorkoutMeta(workout.id, titleDraft, notesDraft);
      setWorkout(await fetchWorkout(workout.id));
      setEditing(false);
    } catch (err) {
      reportError(err, 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!workout) return;
    Alert.alert('Delete workout?', 'This permanently removes the workout and all its sets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWorkout(workout.id);
            router.back();
          } catch (err) {
            reportError(err, 'Could not delete the workout.');
          }
        },
      },
    ]);
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={() => { setLoadError(null); load(); }}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!workout) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const dateText = new Date(workout.startedAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: workout.title,
          headerRight: () => (
            <Pressable onPress={toggleEdit} hitSlop={8}>
              <Text style={styles.headerAction}>{editing ? 'Cancel' : 'Edit'}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={sharedStyles.card}>
        {editing ? (
          <>
            <TextInput style={sharedStyles.textInput} value={titleDraft} onChangeText={setTitleDraft} placeholder="Title" />
            <TextInput
              style={[sharedStyles.textInput, styles.notesInput]}
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Notes"
              multiline
            />
            <Pressable style={sharedStyles.primaryButton} disabled={saving} onPress={handleSave}>
              <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
            <Pressable onPress={toggleEdit} hitSlop={8} style={styles.cancelButton}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={TYPE.body}>{dateText}</Text>
              {workout.source === 'sprint' && (
                <View style={sharedStyles.chip}>
                  <Text style={styles.chipLabel}>Sprint</Text>
                </View>
              )}
            </View>
            <Text style={sharedStyles.helperText}>{durationLabel(workout.startedAt, workout.endedAt)}</Text>
            {!!workout.notes && <Text style={TYPE.body}>{workout.notes}</Text>}
          </>
        )}
      </View>
      {workout.exercises
        .filter((ex) => ex.sets.length > 0)
        .map((ex) => {
          const kind = fieldsForExercise({ exerciseType: ex.exerciseType, unilateral: ex.unilateral }).kind;
          const lines = formatSetLines(ex.sets, kind, unit);
          return (
            <View key={ex.id} style={sharedStyles.card}>
              <Text style={TYPE.sectionTitle}>{ex.exerciseName}</Text>
              {lines.map((line, i) => (
                <Text key={i} style={TYPE.body}>{`Set ${i + 1}  ${line}`}</Text>
              ))}
            </View>
          );
        })}
      <Pressable onPress={handleDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>Delete workout</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  chipLabel: { ...TYPE.helper, color: COLORS.accent, fontWeight: '600' },
  headerAction: { color: COLORS.accent, fontWeight: '600', fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  cancelButton: { alignItems: 'center', paddingVertical: SPACING.xs },
  deleteButton: { alignItems: 'center', paddingVertical: SPACING.md },
  deleteText: { color: COLORS.danger, fontWeight: '600', fontSize: 16 },
});
