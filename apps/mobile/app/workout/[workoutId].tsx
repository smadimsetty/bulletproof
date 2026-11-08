// apps/mobile/app/workout/[workoutId].tsx
//
// Live logger (spec section 4). State: the workout as last fetched from the
// DB, plus local drafts per set id (so typing never round-trips), plus the
// hold and rest timers (pure, from lib/workoutTimers.ts, ticked every 250ms).
// Every DB write is awaited, then the workout is refetched; drafts for ids
// that still exist are kept, new ids are seeded from the row.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  addExercisesToWorkout, addSet, deleteSet, discardWorkout, fetchExerciseCatalog, fetchWorkout,
  finishWorkout, removeWorkoutExercise, setMeasureRom, updateSet,
  type FinishInput, type Workout, type WorkoutExerciseRow, type WorkoutSetRow,
} from '../../lib/workouts';
import { defaultRestSeconds, fieldsForExercise, missingRequiredField, type SetValues } from '../../lib/setFields';
import {
  IDLE, adjustRest, holdRemainingS, restRemainingS, startHold, startRest, startSwitch, stopHold, tickHold,
  type HoldTimer, type RestTimer, type TimerEvent,
} from '../../lib/workoutTimers';
import { formatSeconds } from '../../lib/setFormatting';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';
import type { CatalogExercise } from '../../lib/exerciseSearch';
import SetRow from '../../components/logger/SetRow';
import ExerciseCard from '../../components/logger/ExerciseCard';
import RestBar from '../../components/logger/RestBar';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FinishSheet from '../../components/logger/FinishSheet';

function reportError(err: any, fallback: string) {
  Alert.alert('Error', err?.message ?? fallback);
}

function valuesOf(s: WorkoutSetRow): SetValues {
  return { reps: s.reps, weightKg: s.weightKg, durationS: s.durationS, romValue: s.romValue, romUnit: s.romUnit };
}

export default function LoggerScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [drafts, setDrafts] = useState<Record<string, SetValues>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<HoldTimer>(IDLE);
  const [rest, setRest] = useState<RestTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Refs so timer callbacks (created in an older render) read current state.
  const workoutRef = useRef<Workout | null>(null);
  workoutRef.current = workout;
  const draftsRef = useRef<Record<string, SetValues>>({});
  draftsRef.current = drafts;

  const reload = useCallback(async () => {
    const w = await fetchWorkout(workoutId);
    setWorkout(w);
    setDrafts((prev) => {
      const next: Record<string, SetValues> = {};
      for (const e of w.exercises) for (const s of e.sets) next[s.id] = prev[s.id] ?? valuesOf(s);
      return next;
    });
    return w;
  }, [workoutId]);

  useEffect(() => {
    (async () => {
      try {
        const [, u] = await Promise.all([reload(), fetchWeightUnit().catch(() => 'lbs' as WeightUnit)]);
        setUnit(u);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this workout.');
      }
    })();
  }, [reload]);

  // Opened a saved workout via a stale link -- show its summary instead.
  const endedAt = workout?.endedAt ?? null;
  const loadedId = workout?.id ?? null;
  useEffect(() => {
    if (endedAt && loadedId) router.replace(`/workout-summary/${loadedId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endedAt, loadedId]);

  // ---- lookups ----
  function findSet(w: Workout, setId: string): { exercise: WorkoutExerciseRow; set: WorkoutSetRow } | null {
    for (const exercise of w.exercises) {
      const set = exercise.sets.find((s) => s.id === setId);
      if (set) return { exercise, set };
    }
    return null;
  }
  function kindOf(e: WorkoutExerciseRow) {
    return fieldsForExercise({ exerciseType: e.exerciseType, unilateral: e.unilateral }).kind;
  }
  /** The Right row with the same set number, if setId is an incomplete-partner Left row. */
  function rightPartner(e: WorkoutExerciseRow, s: WorkoutSetRow): WorkoutSetRow | null {
    if (s.side !== 'left') return null;
    return e.sets.find((x) => x.setNumber === s.setNumber && x.side === 'right' && !x.completedAt) ?? null;
  }

  // ---- completing ----
  async function completeRow(setId: string, overrideDurationS?: number, viaTimer = false) {
    const w = workoutRef.current;
    if (!w) return;
    const found = findSet(w, setId);
    if (!found) return;
    const kind = kindOf(found.exercise);
    const values = { ...(draftsRef.current[setId] ?? valuesOf(found.set)), ...(overrideDurationS != null ? { durationS: overrideDurationS } : {}) };
    const missing = missingRequiredField(kind, values);
    if (missing) {
      setHints((h) => ({ ...h, [setId]: missing }));
      return;
    }
    setHints((h) => {
      const { [setId]: _, ...rest } = h;
      return rest;
    });
    try {
      await updateSet(setId, { ...values, completedAt: new Date().toISOString() });
      setDrafts((d) => ({ ...d, [setId]: values }));
      const fresh = await reload();
      const again = findSet(fresh, setId);
      const partner = again ? rightPartner(again.exercise, again.set) : null;
      if (partner && viaTimer && kind === 'hold') {
        setRest(null);
        setHold(startSwitch(partner.id, (draftsRef.current[partner.id] ?? valuesOf(partner)).durationS ?? 30, Date.now()));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else if (!partner) {
        setRest(startRest(defaultRestSeconds(kind), Date.now()));
      }
    } catch (err) {
      reportError(err, 'Could not save that set.');
    }
  }

  async function uncompleteRow(setId: string) {
    try {
      await updateSet(setId, { completedAt: null });
      await reload();
    } catch (err) {
      reportError(err, 'Could not update that set.');
    }
  }

  async function commitEdit(setId: string) {
    const w = workoutRef.current;
    const found = w && findSet(w, setId);
    if (!found || !found.set.completedAt) return; // incomplete rows persist on ✓
    try {
      await updateSet(setId, draftsRef.current[setId]);
      await reload();
    } catch (err) {
      reportError(err, 'Could not save that edit.');
    }
  }

  // ---- timers ----
  function handleTimerEvent(event: TimerEvent) {
    if (!event) return;
    if (event.type === 'hold_completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      completeRow(event.rowId, event.durationS, true);
    }
  }

  const timerActive = hold.phase !== 'idle' || rest !== null;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setHold((prev) => {
        const { timer, event } = tickHold(prev, t);
        if (event) setTimeout(() => handleTimerEvent(event), 0);
        return timer;
      });
      setRest((prev) => {
        if (prev && restRemainingS(prev, t) === 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return null;
        }
        return prev;
      });
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  function startHoldFor(set: WorkoutSetRow) {
    const t = Date.now();
    // Starting a new hold finishes any running one with its elapsed time.
    const stopped = stopHold(hold, t);
    if (stopped.event) handleTimerEvent(stopped.event);
    setRest(null);
    const target = (drafts[set.id] ?? valuesOf(set)).durationS ?? 30;
    setHold(startHold(set.id, target, t));
    setNow(t);
  }

  function stopHoldNow() {
    const { timer, event } = stopHold(hold, Date.now());
    setHold(timer);
    // Manual stop: complete with elapsed time but do NOT auto-switch sides.
    if (event && event.type === 'hold_completed') completeRow(event.rowId, event.durationS, false);
  }

  function timerLabelFor(setId: string): string | null {
    if (hold.phase === 'lead_in' && hold.rowId === setId) return `Get ready ${holdRemainingS(hold, now)}`;
    if (hold.phase === 'holding' && hold.rowId === setId) return formatSeconds(holdRemainingS(hold, now));
    if (hold.phase === 'switching' && hold.nextRowId === setId) return `Switch sides ${holdRemainingS(hold, now)}`;
    return null;
  }

  // ---- structure edits ----
  async function run(action: () => Promise<unknown>, fallback: string) {
    try {
      await action();
      await reload();
    } catch (err) {
      reportError(err, fallback);
    }
  }

  async function openPicker() {
    setPickerOpen(true);
    if (catalog.length === 0) {
      try {
        setCatalog(await fetchExerciseCatalog());
      } catch (err) {
        reportError(err, 'Could not load exercises.');
      }
    }
  }

  async function pickExercise(e: CatalogExercise) {
    setPickerOpen(false);
    await run(
      () => addExercisesToWorkout(workoutId, [{ exerciseId: e.id, sprintDayExerciseId: null, targetText: null, prescribedSets: null }]),
      'Could not add that exercise.'
    );
  }

  // ---- finish / discard ----
  async function handleSave(input: FinishInput) {
    setSaving(true);
    try {
      setHold(IDLE);
      setRest(null);
      const fresh = await reload();
      const result = await finishWorkout(fresh, input);
      if (result === 'no_completed_sets') {
        Alert.alert('No sets completed', 'Tick at least one set, or discard this workout.', [
          { text: 'Keep logging', style: 'cancel', onPress: () => setFinishOpen(false) },
          { text: 'Discard', style: 'destructive', onPress: handleDiscardConfirmed },
        ]);
        return;
      }
      setFinishOpen(false);
      router.replace(`/workout-summary/${workoutId}`);
    } catch (err) {
      reportError(err, 'Could not save this workout. Your sets are still here — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDiscardConfirmed() {
    try {
      await discardWorkout(workoutId);
      setFinishOpen(false);
      router.back();
    } catch (err) {
      reportError(err, 'Could not discard this workout.');
    }
  }

  function handleDiscard() {
    Alert.alert('Discard this workout?', 'Every set logged in it will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: handleDiscardConfirmed },
    ]);
  }

  // ---- render ----
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable style={sharedStyles.primaryButton} onPress={() => reload().then(() => setLoadError(null)).catch((e) => setLoadError(e?.message ?? 'Could not load.'))}>
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
  if (workout.endedAt) {
    // The redirect to the summary happens in the effect above.
    return null;
  }

  return (
    <View style={sharedStyles.screen}>
      <Stack.Screen
        options={{
          title: workout.title,
          headerRight: () => (
            <Pressable onPress={() => setFinishOpen(true)} hitSlop={8}>
              <Text style={styles.finish}>Finish</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[sharedStyles.screenContent, styles.bottomPad]} keyboardShouldPersistTaps="handled">
        {workout.exercises.length === 0 && (
          <Text style={sharedStyles.helperText}>No exercises yet — add one below.</Text>
        )}
        {workout.exercises.map((exercise) => {
          const kind = kindOf(exercise);
          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              unit={unit}
              onAddSet={() => run(() => addSet(exercise), 'Could not add a set.')}
              onToggleRom={() => run(() => setMeasureRom(exercise.id, !exercise.measureRom), 'Could not update.')}
              onRemove={() => run(() => removeWorkoutExercise(exercise.id), 'Could not remove that exercise.')}
              renderSet={(set) => {
                const isTimerRow =
                  (hold.phase === 'lead_in' || hold.phase === 'holding') && hold.rowId === set.id;
                return (
                  <SetRow
                    key={set.id}
                    set={set}
                    kind={kind}
                    measureRom={exercise.measureRom}
                    unit={unit}
                    draft={drafts[set.id] ?? valuesOf(set)}
                    onChange={(next) => setDrafts((d) => ({ ...d, [set.id]: next }))}
                    onCommitEdit={() => commitEdit(set.id)}
                    onToggleComplete={() => (set.completedAt ? uncompleteRow(set.id) : completeRow(set.id))}
                    onToggleWarmup={() =>
                      run(() => updateSet(set.id, { setType: set.setType === 'warmup' ? 'working' : 'warmup' }), 'Could not update.')
                    }
                    onDelete={() => run(() => deleteSet(set.id), 'Could not delete that set.')}
                    timerLabel={timerLabelFor(set.id)}
                    onStartHold={kind === 'hold' && !set.completedAt && !isTimerRow ? () => startHoldFor(set) : null}
                    onStopHold={isTimerRow ? stopHoldNow : null}
                    hint={hints[set.id] ?? null}
                  />
                );
              }}
            />
          );
        })}
        <Pressable style={sharedStyles.primaryButton} onPress={openPicker}>
          <Text style={sharedStyles.primaryButtonText}>+ Add exercise</Text>
        </Pressable>
      </ScrollView>
      {rest && (
        <RestBar
          remainingS={restRemainingS(rest, now)}
          onMinus={() => setRest((r) => (r ? adjustRest(r, -15, Date.now()) : r))}
          onPlus={() => setRest((r) => (r ? adjustRest(r, 15, Date.now()) : r))}
          onSkip={() => setRest(null)}
        />
      )}
      <ExercisePickerSheet visible={pickerOpen} catalog={catalog} onPick={pickExercise} onClose={() => setPickerOpen(false)} />
      <FinishSheet
        visible={finishOpen}
        initialTitle={workout.title}
        isSprint={workout.source === 'sprint'}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onClose={() => setFinishOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  finish: { ...TYPE.label, color: COLORS.accent, fontWeight: '700' },
  bottomPad: { paddingBottom: 120 },
});
