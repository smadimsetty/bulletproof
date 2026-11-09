// apps/mobile/app/workout-summary/[workoutId].tsx
//
// Workout detail, shared by the owner and everyone else who can read it.
// Owner: read-only set lines with an Edit mode (title / notes / visibility /
// photos), save as routine, delete. Others: author header, photos and
// read-only exercises (the like/comment bar, copy and the safety menu live in
// the same screen). Visibility itself is enforced by RLS, not here: if the
// caller can't read the workout the fetch simply finds nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { deleteWorkout, fetchWorkout, updateWorkoutMeta, type Workout } from '../../lib/workouts';
import { fetchRoutine, mergeRoutineUpdate, routineDiffers, routineFromWorkout, saveRoutine } from '../../lib/routines';
import { durationLabel } from '../../lib/historyGrouping';
import { fieldsForExercise } from '../../lib/setFields';
import { formatSetLines } from '../../lib/setFormatting';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';
import { fetchStatsDataset } from '../../lib/stats/dataset';
import { computePrEvents, type PrEvent } from '../../lib/stats/prs';
import { describePrEvent } from '../../lib/stats/format';
import { getMyId } from '../../lib/session';
import { fetchMyProfile, fetchProfileCards, type ProfileCard } from '../../lib/social/profiles';
import { MAX_PHOTOS, photoFailureMessage, removeWorkoutPhoto, uploadWorkoutPhotos } from '../../lib/social/media';
import { visibilityLabel } from '../../lib/social/visibility';
import type { Visibility } from '../../lib/userSettings';
import Avatar from '../../components/social/Avatar';
import PhotoPager from '../../components/social/PhotoPager';
import PhotoStrip from '../../components/social/PhotoStrip';
import SignedImage from '../../components/social/SignedImage';
import VisibilityPicker from '../../components/social/VisibilityPicker';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

/** A workout the caller can't read comes back from .single() as "0 rows". */
function loadMessage(err: any): string {
  const m: string = err?.message ?? '';
  return /json object|0 rows/i.test(m) ? 'This workout is unavailable.' : m || 'Failed to load.';
}

export default function WorkoutSummaryScreen() {
  const { workoutId, checkRoutine } = useLocalSearchParams<{ workoutId: string; checkRoutine?: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [author, setAuthor] = useState<ProfileCard | null>(null);
  const [profileIsPublic, setProfileIsPublic] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [visibilityDraft, setVisibilityDraft] = useState<Visibility>('private');
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [newPhotoUris, setNewPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [prs, setPrs] = useState<PrEvent[]>([]);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const routineCheckedRef = useRef(false);
  const savingRoutineRef = useRef(false);
  const savingEditRef = useRef(false);

  const isOwner = !!workout && workout.ownerId === meId;

  const load = useCallback(async () => {
    try {
      const [w, u, me] = await Promise.all([
        fetchWorkout(workoutId),
        fetchWeightUnit().catch((): WeightUnit => 'lbs'),
        getMyId(),
      ]);
      setWorkout(w);
      setUnit(u);
      setMeId(me);
      setLoadError(null);
      if (w.ownerId === me) {
        // PRs earned in this workout: best effort, the summary works without them.
        fetchStatsDataset({ exerciseIds: Array.from(new Set(w.exercises.map((e) => e.exerciseId))) })
          .then((dataset) => setPrs(computePrEvents(dataset).events.filter((e) => e.workoutId === w.id)))
          .catch(() => setPrs([]));
        fetchMyProfile()
          .then((p) => setProfileIsPublic(!!p?.isPublic))
          .catch(() => undefined);
      } else {
        fetchProfileCards([w.ownerId])
          .then((m) => setAuthor(m.get(w.ownerId) ?? null))
          .catch(() => setAuthor(null));
      }
    } catch (err: any) {
      setLoadError(loadMessage(err));
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  // An unfinished workout of mine belongs in the live logger, not the summary.
  useEffect(() => {
    if (workout && isOwner && workout.endedAt == null) router.replace(`/workout/${workout.id}`);
  }, [workout, isOwner, router]);

  // Right after finishing a workout started from a routine: offer to update
  // the routine, but only if its structure (exercises / set counts) changed.
  // A routine deleted meanwhile, or any lookup failure, just means no prompt.
  useEffect(() => {
    if (!checkRoutine || !workout?.routineId || !workout.endedAt || routineCheckedRef.current) return;
    routineCheckedRef.current = true;
    const saved = workout;
    (async () => {
      const routine = await fetchRoutine(saved.routineId!);
      if (!routine || !routineDiffers(routine, saved)) return;
      Alert.alert('Update routine?', `This workout differs from "${routine.title}". Update the routine to match?`, [
        { text: 'Keep original', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              await saveRoutine(mergeRoutineUpdate(routine, saved));
            } catch (err) {
              reportError(err, 'Could not update the routine.');
            }
          },
        },
      ]);
    })().catch(() => undefined);
  }, [checkRoutine, workout]);

  async function handleSaveAsRoutine() {
    if (!workout || savingRoutine || savingRoutineRef.current) return;
    const draft = routineFromWorkout(workout);
    if (draft.exercises.length === 0) {
      Alert.alert('Nothing to save', 'This workout has no completed working sets.');
      return;
    }
    savingRoutineRef.current = true;
    setSavingRoutine(true);
    try {
      await saveRoutine({ folderId: null, title: draft.title, notes: draft.notes, exercises: draft.exercises });
      Alert.alert('Saved to Routines', `"${draft.title}" is on your Workout tab.`);
    } catch (err) {
      reportError(err, 'Could not save the routine.');
    } finally {
      savingRoutineRef.current = false;
      setSavingRoutine(false);
    }
  }

  function toggleEdit() {
    if (!workout) return;
    if (!editing) {
      setTitleDraft(workout.title);
      setNotesDraft(workout.notes ?? '');
      setVisibilityDraft(workout.visibility);
      setRemovedMediaIds([]);
      setNewPhotoUris([]);
    }
    setEditing(!editing);
  }

  async function handleSave() {
    if (!workout || savingEditRef.current) return;
    savingEditRef.current = true;
    setSaving(true);
    try {
      await updateWorkoutMeta(workout.id, titleDraft, notesDraft, visibilityDraft);
      const keptCount = workout.media.length - removedMediaIds.length;
      for (const m of workout.media.filter((x) => removedMediaIds.includes(x.id))) {
        await removeWorkoutPhoto(m);
      }
      let photoMsg: string | null = null;
      if (newPhotoUris.length > 0) {
        const { failed } = await uploadWorkoutPhotos(workout.id, newPhotoUris, keptCount);
        photoMsg = photoFailureMessage(failed);
      }
      setWorkout(await fetchWorkout(workout.id));
      setEditing(false);
      if (photoMsg) Alert.alert('Some photos did not upload', photoMsg);
    } catch (err) {
      // Includes the word filter's "That text isn't allowed." rejection.
      reportError(err, 'Could not save changes.');
    } finally {
      savingEditRef.current = false;
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
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.retryingButton]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load(); // failure puts the new message in loadError
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
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
  const keptMedia = workout.media.filter((m) => !removedMediaIds.includes(m.id));

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: workout.title,
          headerRight: () =>
            isOwner ? (
              <Pressable onPress={toggleEdit} hitSlop={8}>
                <Text style={styles.headerAction}>{editing ? 'Cancel' : 'Edit'}</Text>
              </Pressable>
            ) : null,
        }}
      />

      {!isOwner && author && (
        <Pressable style={[sharedStyles.card, styles.authorRow]} onPress={() => router.push(`/profile/${author.id}`)}>
          <Avatar path={author.avatarPath} name={author.displayName} size={40} />
          <View style={styles.authorText}>
            <Text style={TYPE.label}>{author.displayName}</Text>
            <Text style={sharedStyles.helperText}>@{author.handle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
        </Pressable>
      )}

      {!editing && workout.media.length > 0 && <PhotoPager paths={workout.media.map((m) => m.path)} />}

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
            <Text style={TYPE.sectionTitle}>Who can see this?</Text>
            <VisibilityPicker value={visibilityDraft} onChange={setVisibilityDraft} canPublic={profileIsPublic || workout.visibility === 'public'} />
            <Text style={TYPE.sectionTitle}>Photos</Text>
            <View style={styles.photoRow}>
              {keptMedia.map((m) => (
                <View key={m.id} style={styles.thumb}>
                  <SignedImage path={m.path} style={styles.thumbImage} />
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() => setRemovedMediaIds((prev) => [...prev, m.id])}
                    hitSlop={6}
                    accessibilityLabel="Remove photo"
                  >
                    <Ionicons name="close" size={14} color={COLORS.card} />
                  </Pressable>
                </View>
              ))}
            </View>
            <PhotoStrip
              uris={newPhotoUris}
              max={Math.max(0, MAX_PHOTOS - keptMedia.length)}
              onChange={setNewPhotoUris}
              disabled={saving}
            />
            <Pressable style={[sharedStyles.primaryButton, saving && styles.retryingButton]} disabled={saving} onPress={handleSave}>
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
              <View style={styles.chips}>
                {isOwner && (
                  <View style={sharedStyles.chip}>
                    <Text style={styles.chipLabel}>{visibilityLabel(workout.visibility)}</Text>
                  </View>
                )}
                {workout.source === 'sprint' && (
                  <View style={sharedStyles.chip}>
                    <Text style={styles.chipLabel}>Sprint</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={sharedStyles.helperText}>{durationLabel(workout.startedAt, workout.endedAt)}</Text>
            {!!workout.notes && <Text style={TYPE.body}>{workout.notes}</Text>}
          </>
        )}
      </View>
      {prs.length > 0 && (
        <View style={sharedStyles.card}>
          <Text style={TYPE.sectionTitle}>Personal records</Text>
          {prs.map((e) => (
            <Text key={`${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`} style={TYPE.body}>
              {describePrEvent(e, unit)}
            </Text>
          ))}
        </View>
      )}
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
      {isOwner && (
        <>
          <Pressable style={[sharedStyles.primaryButton, savingRoutine && styles.retryingButton]} disabled={savingRoutine} onPress={handleSaveAsRoutine}>
            <Text style={sharedStyles.primaryButtonText}>{savingRoutine ? 'Saving…' : 'Save as routine'}</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Delete workout</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const THUMB = 80;

const styles = StyleSheet.create({
  retryingButton: { opacity: 0.6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  authorText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  chips: { flexDirection: 'row', gap: SPACING.xs },
  chipLabel: { ...TYPE.helper, color: COLORS.accent, fontWeight: '600' },
  headerAction: { color: COLORS.accent, fontWeight: '600', fontSize: 16 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  cancelButton: { alignItems: 'center', paddingVertical: SPACING.xs },
  deleteButton: { alignItems: 'center', paddingVertical: SPACING.md },
  deleteText: { color: COLORS.danger, fontWeight: '600', fontSize: 16 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  thumb: { width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden' },
  thumbImage: { width: THUMB, height: THUMB },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
