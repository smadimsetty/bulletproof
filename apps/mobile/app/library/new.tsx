// apps/mobile/app/library/new.tsx
//
// Create (no id) or edit (?id=) a custom exercise (visual spec 4.13), presented as a modal.
// With ?returnTo=picker the new id is left on the pending-pick channel for the screen that
// opened the picker to add on focus.
// TODO(stage4): spec's "Added <name>" toast on return to the picker belongs to the logger side
// of the pending-pick channel; not added here.
// TODO(stage4): spec wants "This exercise is in N workouts and can't be deleted" in the delete
// sheet; the library API only reports that as an error message, so it stays a plain Alert.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { usePreventRemove } from 'expo-router/build/react-navigation/core';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import {
  MOVEMENT_PATTERNS, createCustomExercise, deleteCustomExercise, fetchCustomExercise, parseTagList,
  setPendingPickedExercise, updateCustomExercise, validateCustomExercise,
  type CustomExerciseInput, type CustomExerciseType,
} from '../../lib/library';
import { fieldsForExercise } from '../../lib/setFields';
import { Button, ConfirmSheet, FilterChip, ListGroup, ListRow, PressableScale, ScreenScroll, Sheet, SkeletonCard, SwitchRow, TextField } from '../../components/ui';

const TYPES: { label: string; value: CustomExerciseType }[] = [
  { label: 'Stretch/hold', value: 'mobility_stretch' },
  { label: 'Balance', value: 'balance' },
  { label: 'Strength', value: 'strength' },
  { label: 'Plyo', value: 'plyometric' },
  { label: 'Cardio', value: 'cardio' },
];

const LOGS_HINT = {
  hold: 'Logs seconds held per set.',
  duration: 'Logs time per set.',
  reps: 'Logs reps per set.',
  weight_reps: 'Logs weight and reps per set.',
} as const;

export default function NewExerciseScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id, returnTo } = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const editing = !!id;
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomExerciseType>('mobility_stretch');
  const [pattern, setPattern] = useState<string>('push');
  const [unilateral, setUnilateral] = useState(false);
  const [bodyParts, setBodyParts] = useState('');
  const [equipment, setEquipment] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [patternOpen, setPatternOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Unsaved-changes guard for the modal's swipe-down / Cancel (visual spec 5).
  const baseline = useRef<string | null>(null);
  const leaveOk = useRef(false);
  const pendingLeave = useRef<any>(null);
  const snapshot = JSON.stringify({ name, type, pattern, unilateral, bodyParts, equipment, description, url });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (baseline.current === null) baseline.current = snapshot;
    setDirty(snapshot !== baseline.current);
  }, [loading, snapshot]);
  // Real navigation prevention (also blocks the native swipe-down). Once the user has chosen to leave
  // (leaveOk), the prevented action is simply re-dispatched; it is not prevented a second time.
  usePreventRemove(dirty, ({ data }) => {
    if (leaveOk.current) {
      navigation.dispatch(data.action);
      return;
    }
    pendingLeave.current = data.action;
    setDiscardOpen(true);
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const e = await fetchCustomExercise(id);
        setName(e.name);
        setType(e.exerciseType);
        setPattern(e.movementPattern ?? 'push');
        setUnilateral(e.unilateral);
        setBodyParts(e.bodyParts.join(', '));
        setEquipment(e.equipment.join(', '));
        setDescription(e.description ?? '');
        setUrl(e.demoVideoUrl ?? '');
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Could not load this exercise.');
        leaveOk.current = true;
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const showsPattern = type === 'strength' || type === 'plyometric';

  const savingRef = useRef(false);

  const input: CustomExerciseInput = {
    name,
    exerciseType: type,
    unilateral,
    bodyParts: parseTagList(bodyParts),
    equipment: parseTagList(equipment),
    description: description.trim() || null,
    demoVideoUrl: url.trim() || null,
    movementPattern: showsPattern ? pattern : undefined,
  };
  const valid = validateCustomExercise(input) === null;
  const urlError = url.trim() && !url.trim().startsWith('https://') ? 'Must start with https://' : undefined;

  async function save() {
    if (savingRef.current) return;
    const problem = validateCustomExercise(input);
    if (problem) {
      haptics.error();
      Alert.alert('Check the form', problem);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (id) {
        await updateCustomExercise(id, input);
      } else {
        const newId = await createCustomExercise(input);
        if (returnTo === 'picker') setPendingPickedExercise(newId);
      }
      haptics.success();
      leaveOk.current = true;
      router.back();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not save this exercise.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function doDelete() {
    try {
      await deleteCustomExercise(id!);
      setDeleteOpen(false);
      haptics.success();
      leaveOk.current = true;
      // Two screens deep (library > detail > edit): the detail screen
      // is stale now, so go back to the library list.
      router.dismissTo('/library');
    } catch (err: any) {
      setDeleteOpen(false);
      haptics.error();
      // Includes the clear "used in your history" message for FK 23503.
      Alert.alert('Cannot delete', err?.message ?? 'Could not delete this exercise.');
    }
  }

  const header = (
    <Stack.Screen
      options={{
        title: editing ? 'Edit exercise' : 'New exercise',
        headerLeft: () => <Button title="Cancel" variant="ghost" size="sm" onPress={() => router.back()} />,
        headerRight: () => (
          <PressableScale
            haptic="primary"
            disabled={!valid || saving || loading}
            onPress={save}
            hitSlop={12}
            accessibilityLabel="Save exercise"
            style={styles.save}
          >
            {saving ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={[TYPE.bodyStrong, { color: COLORS.accent }]}>Save</Text>}
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

  const logsKind = fieldsForExercise({ exerciseType: type, unilateral }).kind;

  return (
    <View style={styles.root}>
      {header}
      <ScreenScroll keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TextField label="Name" value={name} onChangeText={setName} maxLength={80} showCount placeholder="e.g. Cat-cow" />

        <View style={styles.block}>
          <Text style={TYPE.overline}>Type</Text>
          <View style={styles.types}>
            {TYPES.map((t) => (
              <FilterChip key={t.value} label={t.label} selected={type === t.value} onToggle={() => setType(t.value)} />
            ))}
          </View>
          <Text style={TYPE.footnote}>{LOGS_HINT[logsKind]}</Text>
        </View>

        {showsPattern ? (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)} layout={LinearTransition.duration(200)}>
            <ListGroup>
              <ListRow title="Movement pattern" value={pattern} trailing="chevron" onPress={() => setPatternOpen(true)} />
            </ListGroup>
          </Animated.View>
        ) : null}

        <ListGroup>
          <SwitchRow title="Unilateral" subtitle="Log left and right separately" value={unilateral} onValueChange={setUnilateral} />
        </ListGroup>

        <TextField
          label="Body parts"
          value={bodyParts}
          onChangeText={setBodyParts}
          helper="Comma-separated, e.g. ankle, calf"
          autoCapitalize="none"
        />
        <TextField
          label="Equipment"
          value={equipment}
          onChangeText={setEquipment}
          helper="Comma-separated, e.g. band, wall"
          autoCapitalize="none"
        />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Cues, setup, why it helps"
        />
        <TextField
          label="Demo URL"
          value={url}
          onChangeText={setUrl}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={urlError}
        />

        {editing ? <Button title="Delete exercise" variant="destructive" fullWidth onPress={() => setDeleteOpen(true)} /> : null}
      </ScreenScroll>

      <Sheet visible={patternOpen} onClose={() => setPatternOpen(false)} title="Movement pattern">
        <View>
          {MOVEMENT_PATTERNS.map((p) => (
            <ListRow
              key={p}
              title={p}
              trailing={pattern === p ? <Text style={[TYPE.callout, { color: COLORS.accent }]}>Selected</Text> : undefined}
              onPress={() => {
                haptics.select();
                setPattern(p);
                setPatternOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete exercise?"
        body="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
      />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard changes?"
        body="You have unsaved changes to this exercise."
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  block: { gap: SPACING.sm },
  types: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING.sm },
  save: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
