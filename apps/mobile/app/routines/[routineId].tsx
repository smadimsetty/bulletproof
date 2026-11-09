// apps/mobile/app/routines/[routineId].tsx
//
// Routine editor. The id "new" creates; any other id edits that routine.
// Drafts are text (so typing never fights number parsing); lib/routineDraft.ts
// converts to the stored numbers on save.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import { fetchRoutine, fetchRoutinesAndFolders, saveRoutine, type RoutineFolder } from '../../lib/routines';
import {
  draftFromRoutineExercise, draftKind, draftToInput, moveItem, newDraft, validateRoutine, type RoutineExerciseDraft,
} from '../../lib/routineDraft';
import { fetchLibrary, takePendingPickedExercise, type LibraryExercise } from '../../lib/library';
import { DEFAULT_SETTINGS, fetchUserSettings } from '../../lib/userSettings';
import type { WeightUnit } from '../../lib/units';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FilterChips from '../../components/library/FilterChips';

export default function RoutineEditorScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const router = useRouter();
  const isNew = routineId === 'new';
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<RoutineFolder[]>([]);
  const [drafts, setDrafts] = useState<RoutineExerciseDraft[]>([]);
  const [unit, setUnit] = useState<WeightUnit>(DEFAULT_SETTINGS.weightUnit);
  const [catalog, setCatalog] = useState<LibraryExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const savingRef = useRef(false);
  const keyCounter = useRef(0);
  const nextKey = () => `d${keyCounter.current++}`;

  const load = useCallback(async () => {
    try {
      const [{ folders: fs }, settings, routine] = await Promise.all([
        fetchRoutinesAndFolders(),
        fetchUserSettings().catch(() => DEFAULT_SETTINGS),
        isNew ? Promise.resolve(null) : fetchRoutine(routineId),
      ]);
      setFolders(fs);
      setUnit(settings.weightUnit);
      if (!isNew) {
        if (!routine) throw new Error('This routine no longer exists.');
        setTitle(routine.title);
        setNotes(routine.notes ?? '');
        setFolderId(routine.folderId);
        setDrafts(routine.exercises.map((e) => draftFromRoutineExercise(e, nextKey(), settings.weightUnit)));
      }
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load this routine.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId, isNew]);
  useEffect(() => {
    load();
  }, [load]);

  function addFromLibrary(e: LibraryExercise) {
    setDrafts((d) => [...d, newDraft({ id: e.id, name: e.name, exerciseType: e.exerciseType, unilateral: e.unilateral, defaultSets: e.defaultSets }, nextKey())]);
  }

  async function openPicker() {
    setPickerOpen(true);
    if (catalog.length === 0) {
      try {
        setCatalog(await fetchLibrary());
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Could not load exercises.');
      }
    }
  }

  // Back from "+ Create exercise": add the new one to this routine.
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingPickedExercise();
      if (!pending) return;
      (async () => {
        try {
          const lib = await fetchLibrary();
          setCatalog(lib);
          const found = lib.find((e) => e.id === pending);
          if (found) addFromLibrary(found);
        } catch (err: any) {
          Alert.alert('Error', err?.message ?? 'Could not add that exercise.');
        }
      })();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const patchDraft = (key: string, patch: Partial<RoutineExerciseDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function save() {
    if (savingRef.current) return;
    const problem = validateRoutine(title, drafts);
    if (problem) {
      Alert.alert('Check the routine', problem);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveRoutine({
        id: isNew ? undefined : routineId,
        folderId,
        title,
        notes: notes.trim() || null,
        exercises: drafts.map((d, i) => draftToInput(d, i + 1, unit)),
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save this routine.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={load}>
          <Text style={sharedStyles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New routine' : 'Edit routine' }} />
      <View style={sharedStyles.card}>
        <TextInput style={sharedStyles.textInput} value={title} onChangeText={setTitle} maxLength={80} placeholder="Routine title" placeholderTextColor={COLORS.muted} />
        <TextInput
          style={[sharedStyles.textInput, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Notes"
          placeholderTextColor={COLORS.muted}
        />
        {folders.length > 0 ? (
          <>
            <Text style={TYPE.label}>Folder</Text>
            <FilterChips options={folders.map((f) => ({ label: f.name, value: f.id }))} value={folderId} onChange={setFolderId} />
            <Text style={sharedStyles.helperText}>{folderId ? 'Tap the selected folder again for Unfiled.' : 'Unfiled'}</Text>
          </>
        ) : null}
      </View>

      {drafts.map((d, i) => {
        const kind = draftKind(d);
        return (
          <View key={d.key} style={sharedStyles.card}>
            <View style={styles.exerciseHeader}>
              <Text style={[TYPE.sectionTitle, styles.flex]}>{d.exerciseName}</Text>
              <Pressable hitSlop={8} disabled={i === 0} onPress={() => setDrafts((ds) => moveItem(ds, i, i - 1))} accessibilityLabel="Move up">
                <Ionicons name="chevron-up" size={22} color={i === 0 ? COLORS.border : COLORS.muted} />
              </Pressable>
              <Pressable hitSlop={8} disabled={i === drafts.length - 1} onPress={() => setDrafts((ds) => moveItem(ds, i, i + 1))} accessibilityLabel="Move down">
                <Ionicons name="chevron-down" size={22} color={i === drafts.length - 1 ? COLORS.border : COLORS.muted} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} accessibilityLabel="Remove">
                <Ionicons name="close-circle" size={22} color={COLORS.muted} />
              </Pressable>
            </View>
            <View style={styles.fields}>
              <Field label="Sets" value={d.sets} onChange={(v) => patchDraft(d.key, { sets: v })} />
              {kind === 'weight_reps' || kind === 'reps' ? <Field label="Reps" value={d.reps} onChange={(v) => patchDraft(d.key, { reps: v })} /> : null}
              {kind === 'weight_reps' ? <Field label={`Weight (${unit})`} value={d.weight} onChange={(v) => patchDraft(d.key, { weight: v })} decimal /> : null}
              {kind === 'hold' || kind === 'duration' ? (
                <Field label={kind === 'hold' ? 'Hold (s)' : 'Duration (s)'} value={d.durationS} onChange={(v) => patchDraft(d.key, { durationS: v })} />
              ) : null}
              <Field label="Rest (s)" value={d.restS} onChange={(v) => patchDraft(d.key, { restS: v })} />
            </View>
          </View>
        );
      })}

      <Pressable style={styles.addButton} onPress={openPicker}>
        <Text style={styles.addText}>+ Add exercise</Text>
      </Pressable>
      <Pressable style={[sharedStyles.primaryButton, saving && styles.disabled]} onPress={save} disabled={saving}>
        <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save routine'}</Text>
      </Pressable>

      <ExercisePickerSheet
        visible={pickerOpen}
        catalog={catalog}
        onPick={(e) => {
          setPickerOpen(false);
          addFromLibrary(e);
        }}
        onClose={() => setPickerOpen(false)}
        onCreate={() => {
          setPickerOpen(false);
          router.push('/library/new?returnTo=picker');
        }}
      />
    </ScrollView>
  );
}

function Field({ label, value, onChange, decimal }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={sharedStyles.helperText}>{label}</Text>
      <TextInput
        style={[sharedStyles.textInput, styles.fieldInput]}
        value={value}
        onChangeText={onChange}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="-"
        placeholderTextColor={COLORS.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
  flex: { flex: 1 },
  notes: { minHeight: 60, textAlignVertical: 'top' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  field: { width: 88, gap: 2 },
  fieldInput: { textAlign: 'center' },
  addButton: { alignItems: 'center', paddingVertical: SPACING.sm },
  addText: { ...TYPE.body, color: COLORS.accent, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
