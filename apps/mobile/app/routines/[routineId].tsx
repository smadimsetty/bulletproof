// apps/mobile/app/routines/[routineId].tsx
//
// Routine editor (visual spec 4.14), presented as a modal. The id "new" creates; any other
// id edits that routine. Drafts are text (so typing never fights number parsing);
// lib/routineDraft.ts converts to the stored numbers on save.
// TODO(stage4): save problems stay a plain Alert -- a native modal covers the root toasts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { createFolder, fetchRoutine, fetchRoutinesAndFolders, saveRoutine, type RoutineFolder } from '../../lib/routines';
import {
  draftFromRoutineExercise, draftKind, draftToInput, moveItem, newDraft, validateRoutine, type RoutineExerciseDraft,
} from '../../lib/routineDraft';
import { fetchLibrary, takePendingPickedExercise, type LibraryExercise } from '../../lib/library';
import { DEFAULT_SETTINGS, fetchUserSettings } from '../../lib/userSettings';
import type { WeightUnit } from '../../lib/units';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FolderSheet, { type FolderSheetMode } from '../../components/routines/FolderSheet';
import {
  Button, Card, ConfirmSheet, EmptyState, ErrorState, IconButton, ListGroup, ListRow, NumberField, PressableScale, ScreenScroll,
  SectionHeader, SkeletonCard, TextField,
} from '../../components/ui';

export default function RoutineEditorScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const isNew = routineId === 'new';
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [titleFocused, setTitleFocused] = useState(false);
  const [notes, setNotes] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<RoutineFolder[]>([]);
  const [drafts, setDrafts] = useState<RoutineExerciseDraft[]>([]);
  const [unit, setUnit] = useState<WeightUnit>(DEFAULT_SETTINGS.weightUnit);
  const [catalog, setCatalog] = useState<LibraryExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderSheet, setFolderSheet] = useState<FolderSheetMode | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const savingRef = useRef(false);
  const keyCounter = useRef(0);
  const nextKey = () => `d${keyCounter.current++}`;

  // Unsaved-changes guard for the modal's swipe-down / Cancel (visual spec 5).
  const baseline = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const leaveOk = useRef(false);
  const pendingLeave = useRef<any>(null);
  const snapshot = JSON.stringify({ title, notes, folderId, drafts });
  useEffect(() => {
    if (loading || loadError) return;
    if (baseline.current === null) baseline.current = snapshot;
    dirtyRef.current = snapshot !== baseline.current;
  }, [loading, loadError, snapshot]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (leaveOk.current || !dirtyRef.current) return;
        e.preventDefault();
        pendingLeave.current = e.data.action;
        setDiscardOpen(true);
      }),
    [navigation]
  );

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
      haptics.error();
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
      haptics.success();
      leaveOk.current = true;
      router.back();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not save this routine.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: isNew ? 'New routine' : 'Edit routine',
        headerLeft: () => <Button title="Cancel" variant="ghost" size="sm" onPress={() => router.back()} />,
        headerRight: () => (
          <PressableScale
            haptic="primary"
            disabled={saving || loading || !!loadError}
            onPress={save}
            hitSlop={12}
            accessibilityLabel="Save routine"
            style={styles.save}
          >
            <Text style={[TYPE.bodyStrong, { color: COLORS.accent }]}>{saving ? '…' : 'Save'}</Text>
          </PressableScale>
        ),
      }}
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <ScreenScroll>
          <SkeletonCard />
          <SkeletonCard />
        </ScreenScroll>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.root}>
        {header}
        <ScreenScroll>
          <ErrorState
            message={loadError}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load();
              setRetrying(false);
            }}
          />
        </ScreenScroll>
      </View>
    );
  }

  const folderName = folders.find((f) => f.id === folderId)?.name ?? 'Unfiled';

  return (
    <View style={styles.root}>
      {header}
      <ScreenScroll keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder="Routine title"
          placeholderTextColor={COLORS.textTertiary}
          selectionColor={COLORS.accent}
          keyboardAppearance="dark"
          accessibilityLabel="Routine title"
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          style={[TYPE.title2, styles.title, { borderBottomColor: titleFocused ? COLORS.accent : COLORS.border }]}
        />
        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Notes" />
        <ListGroup>
          <ListRow
            title="Folder"
            value={folderName}
            trailing="chevron"
            onPress={() =>
              setFolderSheet({
                kind: 'pick',
                folders,
                current: folderId,
                onPick: setFolderId,
                onCreate: async (name) => {
                  const id = await createFolder(name);
                  setFolders((await fetchRoutinesAndFolders()).folders);
                  setFolderId(id);
                },
              })
            }
          />
        </ListGroup>

        <SectionHeader title="Exercises" inset={SPACING.xs} />
        {drafts.length === 0 ? (
          <EmptyState
            compact
            icon="list-outline"
            title="No exercises yet"
            body="Add the moves you want in this routine."
            action={{ label: 'Add exercises', onPress: openPicker }}
          />
        ) : null}
        {drafts.map((d, i) => {
          const kind = draftKind(d);
          return (
            <Animated.View key={d.key} layout={LinearTransition.duration(200)} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>
              <Card>
                <View style={styles.exerciseHeader}>
                  <Text style={[TYPE.title3, styles.flex]} numberOfLines={2}>
                    {d.exerciseName}
                  </Text>
                  <IconButton icon="chevron-up" size="sm" disabled={i === 0} accessibilityLabel="Move up" onPress={() => setDrafts((ds) => moveItem(ds, i, i - 1))} />
                  <IconButton
                    icon="chevron-down"
                    size="sm"
                    disabled={i === drafts.length - 1}
                    accessibilityLabel="Move down"
                    onPress={() => setDrafts((ds) => moveItem(ds, i, i + 1))}
                  />
                  <IconButton icon="close" size="sm" accessibilityLabel={`Remove ${d.exerciseName}`} onPress={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} />
                </View>
                <View style={styles.fields}>
                  <SetsStepper value={d.sets} onChange={(v) => patchDraft(d.key, { sets: v })} />
                  {kind === 'weight_reps' || kind === 'reps' ? (
                    <Field label="Reps" value={d.reps} onChange={(v) => patchDraft(d.key, { reps: v })} />
                  ) : null}
                  {kind === 'weight_reps' ? (
                    <Field label={`Weight (${unit})`} value={d.weight} onChange={(v) => patchDraft(d.key, { weight: v })} decimal />
                  ) : null}
                  {kind === 'hold' || kind === 'duration' ? (
                    <Field label={kind === 'hold' ? 'Hold s' : 'Time s'} value={d.durationS} onChange={(v) => patchDraft(d.key, { durationS: v })} />
                  ) : null}
                  <Field label="Rest s" value={d.restS} onChange={(v) => patchDraft(d.key, { restS: v })} />
                </View>
              </Card>
            </Animated.View>
          );
        })}

        {drafts.length > 0 ? <Button title="Add exercises" icon="add" variant="secondary" size="lg" fullWidth onPress={openPicker} /> : null}
      </ScreenScroll>

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
      <FolderSheet mode={folderSheet} onClose={() => setFolderSheet(null)} />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard changes?"
        body="You have unsaved changes to this routine."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          leaveOk.current = true;
          const action = pendingLeave.current;
          if (action) navigation.dispatch(action);
          else router.back();
        }}
      />
    </View>
  );
}

/** Compact sets stepper: text draft in, text draft out (the draft stays a string so typing never fights parsing). */
function SetsStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number.parseInt(value, 10);
  const current = Number.isFinite(n) ? n : 0;
  const bump = (delta: number) => {
    const next = Math.min(20, Math.max(1, current + delta));
    if (next === current) {
      haptics.warning();
      return;
    }
    haptics.select();
    onChange(String(next));
  };
  return (
    <View style={styles.field}>
      <Text style={TYPE.overline}>Sets</Text>
      <View style={styles.stepper}>
        <IconButton icon="remove" size="sm" variant="filled" disabled={current <= 1} accessibilityLabel="Fewer sets" onPress={() => bump(-1)} />
        <Text style={[TYPE.stat, styles.setsValue]} maxFontSizeMultiplier={1.2}>
          {current || '-'}
        </Text>
        <IconButton icon="add" size="sm" variant="filled" disabled={current >= 20} accessibilityLabel="More sets" onPress={() => bump(1)} />
      </View>
    </View>
  );
}

function Field({ label, value, onChange, decimal }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={TYPE.overline}>{label}</Text>
      <NumberField value={value} onChangeText={onChange} decimal={decimal} placeholder="-" accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  save: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { borderBottomWidth: 1, paddingVertical: SPACING.sm },
  flex: { flex: 1 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  field: { gap: SPACING.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, height: 44 },
  setsValue: { minWidth: 28, textAlign: 'center' },
});
