// apps/mobile/app/workout-summary/[workoutId].tsx
//
// Workout detail, shared by the owner and everyone else who can read it.
// Owner: read-only set lines with an Edit mode (title / notes / visibility /
// photos), save as routine, delete. Others: author header, photos and
// read-only exercises (the like/comment bar, copy and the safety menu live in
// the same screen). Visibility itself is enforced by RLS, not here: if the
// caller can't read the workout the fetch simply finds nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ELEVATION, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import { deleteWorkout, fetchWorkout, updateWorkoutMeta, type Workout } from '../../lib/workouts';
import { fetchRoutine, mergeRoutineUpdate, routineDiffers, routineFromWorkout, saveRoutine, type Routine } from '../../lib/routines';
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
import ShareCard from '../../components/share/ShareCard';
import { shareViewAsImage } from '../../lib/shareImage';
import { fetchSocialSummary, setLiked, type SocialSummary } from '../../lib/social/interactions';
import { copyWorkout } from '../../lib/social/copyWorkout';
import { useSafety } from '../../components/social/ReportSheet';
import { hideWorkout } from '../../lib/social/safety';
import { useToast } from '../../components/Toast';
import {
  ActionSheet, type ActionSheetAction, Badge, Button, Card, Chip, ConfirmSheet, EmptyState, ErrorState, IconButton, PressableScale, ScreenScroll,
  SectionHeader, Sheet, SkeletonCard, Skeleton, Stat, StickyFooter, TextField,
} from '../../components/ui';

// Let an ActionSheet finish dismissing before the next Modal or Alert presents (iOS drops overlapping presentations).

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

/** A workout the caller can't read comes back from .single() as "0 rows". */
function loadMessage(err: any): string {
  const m: string = err?.message ?? '';
  return /json object|0 rows/i.test(m) ? 'This workout is unavailable.' : m || 'Failed to load.';
}

export default function WorkoutSummaryScreen() {
  const { workoutId, checkRoutine, justFinished, photoFail } = useLocalSearchParams<{ workoutId: string; checkRoutine?: string; justFinished?: string; photoFail?: string }>();
  const toast = useToast();
  const photoFailShownRef = useRef(false);
  useEffect(() => {
    const n = Number(photoFail);
    if (!Number.isFinite(n) || n <= 0 || photoFailShownRef.current) return;
    photoFailShownRef.current = true;
    toast.show({ message: photoFailureMessage(n) ?? "Some photos didn't upload.", tone: 'danger' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoFail]);
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
  const [social, setSocial] = useState<SocialSummary | null>(null);
  const likingRef = useRef(false);
  const copyingRef = useRef(false);
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const shareCardRef = useRef<View>(null);
  const safety = useSafety();
  // Sheets replacing the old Alerts.
  const [routinePrompt, setRoutinePrompt] = useState<{ routine: Routine; saved: Workout } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      // Likes/comments are secondary: the workout still shows if they fail.
      fetchSocialSummary(w.id).then(setSocial).catch(() => undefined);
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
      setRoutinePrompt({ routine, saved });
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
      toast.show({ message: `Saved to Routines: "${draft.title}"`, tone: 'success' });
    } catch (err) {
      reportError(err, 'Could not save the routine.');
    } finally {
      savingRoutineRef.current = false;
      setSavingRoutine(false);
    }
  }

  async function handleToggleLike() {
    if (!workout || !social || likingRef.current) return;
    likingRef.current = true;
    const next = !social.likedByMe;
    if (next) haptics.tap(); // like: light tap; unlike: none (spec 2.6)
    setSocial({ ...social, likedByMe: next, likeCount: Math.max(0, social.likeCount + (next ? 1 : -1)) });
    try {
      await setLiked(workout.id, next);
    } catch (err) {
      setSocial(social); // roll back
      reportError(err, 'Could not update your like.');
    } finally {
      likingRef.current = false;
    }
  }

  async function runCopy(mode: 'start' | 'routine') {
    if (!workout || copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    try {
      const result = await copyWorkout(workout.id, mode);
      if (result.kind === 'started') {
        router.push(`/workout/${result.workoutId}`);
      } else if (result.kind === 'routine') {
        toast.show({ message: `Saved to Routines: "${routineFromWorkout(workout).title}"`, tone: 'success' });
      } else {
        const activeId = result.activeWorkoutId;
        Alert.alert('You already have a workout in progress', 'Finish or discard it before starting another.', [
          { text: 'Cancel', style: 'cancel' },
          ...(activeId ? [{ text: 'Resume', onPress: () => router.push(`/workout/${activeId}`) }] : []),
        ]);
      }
    } catch (err) {
      reportError(err, 'Could not copy this workout.');
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }

  function handleCopy() {
    setCopyMenuOpen(true);
  }

  async function handleShare() {
    if (!workout || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    try {
      await shareViewAsImage(shareCardRef, workout.title);
    } catch (err) {
      reportError(err, 'Could not share this workout.');
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }

  // Header menu: owner (Edit / Save as routine / Share / Delete) or others (Report / Hide / Block).
  function openMenu() {
    if (!workout) return;
    setMenuOpen(true);
  }

  function otherMenuActions() {
    if (!workout) return [];
    const w = workout;
    const actions: ActionSheetAction[] = [
      {
        label: 'Report workout',
        icon: 'flag-outline',
        onPress: () => safety.openReport({ type: 'workout', id: w.id, label: 'this workout', blockUser: author ?? undefined, after: () => router.back() }),
      },
      {
        label: 'Hide from my feed',
        icon: 'eye-off-outline',
        onPress: async () => {
          try {
            await hideWorkout(w.id);
            router.back();
          } catch (err) {
            reportError(err, 'Could not hide this workout.');
          }
        },
      },
    ];
    if (author) {
      actions.push({
        label: `Block @${author.handle}`,
        icon: 'ban-outline',
        destructive: true,
        onPress: () => safety.confirmBlock(author, () => router.back()),
      });
    }
    return actions;
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
      const kept = workout.media.filter((x) => !removedMediaIds.includes(x.id));
      for (const m of workout.media.filter((x) => removedMediaIds.includes(x.id))) {
        await removeWorkoutPhoto(m);
      }
      let photoMsg: string | null = null;
      // Cap here too (the picker caps, but this is the last line of defence),
      // and append after the highest kept position so order never collides.
      const toUpload = newPhotoUris.slice(0, Math.max(0, MAX_PHOTOS - kept.length));
      if (toUpload.length > 0) {
        const nextPosition = kept.reduce((max, m) => Math.max(max, m.position + 1), 0);
        const { failed } = await uploadWorkoutPhotos(workout.id, toUpload, nextPosition);
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

  async function handleDeleteConfirmed() {
    if (!workout || deleting) return;
    setDeleting(true);
    try {
      await deleteWorkout(workout.id);
      setDeleteOpen(false);
      router.back();
    } catch (err) {
      setDeleteOpen(false);
      reportError(err, 'Could not delete the workout.');
    } finally {
      setDeleting(false);
    }
  }

  if (loadError) {
    const unavailable = loadError === 'This workout is unavailable.';
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: '' }} />
        {unavailable ? (
          <EmptyState
            style={styles.centered}
            icon="eye-off-outline"
            title="This workout isn't available"
            body="It may be private or deleted."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <ErrorState
            style={styles.centered}
            message={loadError}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load(); // failure puts the new message in loadError
              setRetrying(false);
            }}
          />
        )}
      </View>
    );
  }
  if (!workout) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.skeletons}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={14} />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  const dateText = new Date(workout.startedAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const metaText = `${new Date(workout.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(
    workout.startedAt
  ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const keptMedia = workout.media.filter((m) => !removedMediaIds.includes(m.id));
  const shownExercises = workout.exercises.filter((e) => e.sets.length > 0);
  const setCount = shownExercises.reduce((n, e) => n + e.sets.length, 0);
  const topExercises = shownExercises.slice(0, 3).map((e) => e.exerciseName);
  const shareStats = [
    { label: 'Duration', value: durationLabel(workout.startedAt, workout.endedAt) || '—' },
    { label: 'Exercises', value: String(shownExercises.length) },
    ...(isOwner ? [{ label: 'Personal records', value: String(prs.length) }] : []),
  ];
  const celebrate = isOwner && justFinished === '1';

  const socialBar = (
    <View style={styles.socialRow}>
      <LikeButton liked={!!social?.likedByMe} count={social?.likeCount ?? 0} disabled={!social} onPress={handleToggleLike} />
      <PressableScale style={styles.socialBtn} hitSlop={8} onPress={() => router.push(`/comments/${workout.id}`)} accessibilityLabel="Comments">
        <Ionicons name="chatbubble-outline" size={22} color={COLORS.textSecondary} />
        <Text style={styles.socialCount}>{social?.commentCount ?? 0}</Text>
      </PressableScale>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton icon="share-outline" size="sm" accessibilityLabel="Share workout card" disabled={sharing} onPress={handleShare} />
              <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="More options" onPress={openMenu} />
            </View>
          ),
        }}
      />
      <ScreenScroll keyboardShouldPersistTaps="handled">
        {!isOwner && author && (
          <Card onPress={() => router.push(`/profile/${author.id}`)} accessibilityLabel={`${author.displayName}, profile`}>
            <View style={styles.authorRow}>
              <Avatar path={author.avatarPath} name={author.displayName} size={44} />
              <View style={styles.authorText}>
                <Text style={TYPE.bodyStrong}>{author.displayName}</Text>
                <Text style={TYPE.footnote}>@{author.handle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </View>
          </Card>
        )}

        {celebrate ? (
          <Card variant="accent" style={ELEVATION.glow}>
            <View style={styles.heroRow}>
              <PopCheck />
              <Text style={TYPE.title2}>Workout saved</Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.titleBlock}>
          <Text style={TYPE.title1}>{workout.title}</Text>
          <View style={styles.metaRow}>
            <Text style={TYPE.footnote}>{metaText}</Text>
            {isOwner ? (
              <Chip
                label={visibilityLabel(workout.visibility)}
                icon={workout.visibility === 'private' ? 'lock-closed' : workout.visibility === 'followers' ? 'people' : 'globe-outline'}
              />
            ) : null}
            {workout.source === 'sprint' ? <Badge label="Sprint" tone="tint" /> : null}
          </View>
          {!!workout.notes && <Text style={TYPE.body}>{workout.notes}</Text>}
        </View>

        {workout.media.length > 0 && (
          <View style={styles.photos}>
            <PhotoPager paths={workout.media.map((m) => m.path)} aspectRatio={4 / 5} />
          </View>
        )}

        <View style={styles.tiles}>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Time" value={durationLabel(workout.startedAt, workout.endedAt) || '—'} />
          </Card>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Exercises" value={shownExercises.length} />
          </Card>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Sets" value={setCount} />
          </Card>
        </View>

        {prs.length > 0 && (
          <Card variant="accent" style={celebrate ? ELEVATION.glow : undefined}>
            <Text style={TYPE.overline}>{`Personal records (${prs.length})`}</Text>
            {prs.map((e) => (
              <View key={`${e.exerciseId}-${e.kind}-${e.side ?? ''}-${e.unit}`} style={styles.prRow}>
                <Ionicons name="trophy" size={16} color={COLORS.accent} />
                <Text style={[TYPE.callout, styles.prText, { color: COLORS.textPrimary }]}>{describePrEvent(e, unit)}</Text>
              </View>
            ))}
          </Card>
        )}

        {isOwner ? <Card padding={12}>{socialBar}</Card> : null}

        {shownExercises.length > 0 ? <SectionHeader title="Exercises" inset={SPACING.xs} /> : null}
        {shownExercises.map((ex) => {
          const kind = fieldsForExercise({ exerciseType: ex.exerciseType, unilateral: ex.unilateral }).kind;
          const lines = formatSetLines(ex.sets, kind, unit);
          return (
            <Card key={ex.id}>
              <PressableScale scaleTo={0.98} onPress={() => router.push(`/exercise/${ex.exerciseId}`)} accessibilityLabel={`${ex.exerciseName} details`}>
                <Text style={TYPE.title3}>{ex.exerciseName}</Text>
              </PressableScale>
              <View style={styles.setGrid}>
                {lines.map((line, i) => (
                  <Text key={i} style={styles.setLine}>{`${i + 1}  ${line}`}</Text>
                ))}
              </View>
            </Card>
          );
        })}
        {safety.element}
        {/* Rendered off-screen and captured to an image by the Share button. */}
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCard
            ref={shareCardRef}
            title={workout.title}
            subtitle={dateText}
            stats={shareStats}
            footer={topExercises.join(' · ')}
          />
        </View>
      </ScreenScroll>

      {isOwner ? (
        <StickyFooter style={styles.footerRow}>
          <Button
            title="Save as routine"
            variant="secondary"
            style={styles.footerBtn}
            loading={savingRoutine}
            onPress={handleSaveAsRoutine}
          />
          {celebrate ? (
            <Button title="Done" style={styles.footerBtn} onPress={() => router.dismissTo('/')} />
          ) : (
            <Button title="Start again" icon="play" style={styles.footerBtn} loading={copying} onPress={() => runCopy('start')} />
          )}
        </StickyFooter>
      ) : (
        <StickyFooter style={styles.footerRow}>
          {socialBar}
          <View style={styles.flexSpacer} />
          <Button title="Copy workout" size="sm" loading={copying} onPress={handleCopy} />
        </StickyFooter>
      )}

      {/* Owner menu / other's menu */}
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={
          isOwner
            ? [
                { label: 'Edit', icon: 'create-outline', onPress: toggleEdit },
                { label: 'Save as routine', icon: 'albums-outline', onPress: handleSaveAsRoutine },
                { label: 'Share card', icon: 'share-outline', onPress: handleShare },
                { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => setDeleteOpen(true) },
              ]
            : otherMenuActions()
        }
      />
      <ActionSheet
        visible={copyMenuOpen}
        onClose={() => setCopyMenuOpen(false)}
        title="Copy workout"
        actions={[
          { label: 'Start now', icon: 'play-outline', onPress: () => runCopy('start') },
          { label: 'Save as routine', icon: 'albums-outline', onPress: () => runCopy('routine') },
        ]}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete workout?"
        body="This permanently removes the workout and all its sets."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirmed}
      />
      <ConfirmSheet
        visible={routinePrompt !== null}
        onClose={() => setRoutinePrompt(null)}
        title="Update routine?"
        body={routinePrompt ? `This workout changed exercises or sets. Update "${routinePrompt.routine.title}" to match?` : undefined}
        confirmLabel="Update routine"
        cancelLabel="Keep original"
        onConfirm={async () => {
          const p = routinePrompt;
          setRoutinePrompt(null);
          if (!p) return;
          try {
            await saveRoutine(mergeRoutineUpdate(p.routine, p.saved));
          } catch (err) {
            reportError(err, 'Could not update the routine.');
          }
        }}
      />

      {/* Edit (owner): title / notes / visibility / photos */}
      <Sheet
        visible={editing}
        onClose={() => {
          if (!saving) toggleEdit();
        }}
        title="Edit workout"
        snap="tall"
        dismissable={!saving}
        footer={<Button title="Save" size="lg" fullWidth loading={saving} onPress={handleSave} />}
      >
        <TextField label="Title" value={titleDraft} onChangeText={setTitleDraft} placeholder="Title" />
        <TextField label="Notes" value={notesDraft} onChangeText={setNotesDraft} placeholder="Notes" multiline />
        <View style={styles.editBlock}>
          <Text style={TYPE.overline}>Visibility</Text>
          <VisibilityPicker value={visibilityDraft} onChange={setVisibilityDraft} canPublic={profileIsPublic || workout.visibility === 'public'} />
        </View>
        <View style={styles.editBlock}>
          <Text style={TYPE.overline}>Photos</Text>
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
                  <Ionicons name="close" size={14} color={COLORS.textPrimary} />
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
        </View>
      </Sheet>
    </View>
  );
}

/** Heart that pops (1 -> 1.3 -> 1) when it becomes liked. */
function LikeButton({ liked, count, disabled, onPress }: { liked: boolean; count: number; disabled: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (liked && !reduced) {
      scale.value = 1.3;
      scale.value = withSpring(1, { ...MOTION.popSpring });
    }
  }, [liked, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <PressableScale
      style={styles.socialBtn}
      haptic="none" // the like handler fires its own light tap (like only)
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
    >
      <Animated.View style={style}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? COLORS.accent : COLORS.textSecondary} />
      </Animated.View>
      <Text style={styles.socialCount}>{count}</Text>
    </PressableScale>
  );
}

/** Success check that pops in on mount (the "Workout saved" hero). */
function PopCheck() {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.4);
  useEffect(() => {
    if (!reduced) scale.value = withSpring(1, { ...MOTION.popSpring });
  }, [reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
    </Animated.View>
  );
}

const THUMB = 72;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, alignSelf: 'center', justifyContent: 'center' },
  skeletons: { padding: SPACING.lg, gap: SPACING.md },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  authorText: { flex: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  titleBlock: { gap: SPACING.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm },
  photos: { borderRadius: RADII.lg, overflow: 'hidden' },
  tiles: { flexDirection: 'row', gap: SPACING.md },
  tile: { flex: 1, minHeight: 96, justifyContent: 'center' },
  prRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  prText: { flex: 1 },
  setGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACING.xs },
  setLine: { ...TYPE.callout, width: '50%', color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44 },
  socialCount: { ...TYPE.callout, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  flexSpacer: { flex: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  footerBtn: { flex: 1 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  editBlock: { gap: SPACING.sm },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  thumb: { width: THUMB, height: THUMB, borderRadius: RADII.sm, overflow: 'hidden' },
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
