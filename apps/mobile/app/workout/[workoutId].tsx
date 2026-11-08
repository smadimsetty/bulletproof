// apps/mobile/app/workout/[workoutId].tsx
//
// Live logger (spec section 4). State: the workout as last fetched from the
// DB, plus local drafts per set id (so typing never round-trips), plus the
// hold and rest timers (pure, from lib/workoutTimers.ts, ticked every 250ms).
// Every DB write is awaited, then the workout is refetched; drafts for ids
// that still exist are kept, new ids are seeded from the row.
//
// Timer rules (fixes from the 2026-11-07 final review):
// - holdRef/restRef are the synchronous source of truth; every change goes
//   through applyHold/applyRest, and every hold change bumps holdGenRef.
// - A row's completion is single-shot: inFlightRef holds the pending
//   completion per row id, and a second completion of the same id is ignored.
// - Manual ✓ / un-tick / × on a row first stops any hold aimed at that row.
// - After a completion's writes resolve, switch-sides / rest only start if
//   the hold wasn't changed in the meantime (holdGenRef unchanged), so a hold
//   the user just started is never clobbered.
// - Side effects (haptics, completions) run outside state updaters.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import {
  addExercisesToWorkout, addSet, deleteSet, discardWorkout, fetchExerciseCatalog, fetchPreviousSetsForExercises,
  fetchWorkout, finishWorkout, removeWorkoutExercise, setMeasureRom, updateSet,
  type FinishInput, type Workout, type WorkoutExerciseRow, type WorkoutSetRow,
} from '../../lib/workouts';
import { defaultRestSeconds, fieldsForExercise, missingRequiredField, type SetValues } from '../../lib/setFields';
import { dirtyCompletedSets } from '../../lib/finishPlan';
import { previousHint, type PreviousSet } from '../../lib/previousValues';
import {
  IDLE, adjustRest, holdRemainingS, holdTargetRowId, restRemainingS, startHold, startRest, startSwitch, stopHold,
  tickHold, type HoldTimer, type RestTimer,
} from '../../lib/workoutTimers';
import { formatSeconds } from '../../lib/setFormatting';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';
import type { CatalogExercise } from '../../lib/exerciseSearch';
import SetRow from '../../components/logger/SetRow';
import ExerciseCard from '../../components/logger/ExerciseCard';
import RestBar from '../../components/logger/RestBar';
import Ticker from '../../components/logger/Ticker';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FinishSheet from '../../components/logger/FinishSheet';
import LastAssessmentSheet from '../../components/LastAssessmentSheet';

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
  const [prevByExercise, setPrevByExercise] = useState<Record<string, PreviousSet[]>>({});
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Refs so timer callbacks (created in an older render) read current state.
  const workoutRef = useRef<Workout | null>(null);
  workoutRef.current = workout;
  const draftsRef = useRef<Record<string, SetValues>>({});
  draftsRef.current = drafts;
  const holdRef = useRef<HoldTimer>(IDLE);
  const holdGenRef = useRef(0);
  const restRef = useRef<RestTimer | null>(null);
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const prevRequestedRef = useRef<Set<string>>(new Set());

  function applyHold(next: HoldTimer) {
    holdRef.current = next;
    holdGenRef.current += 1;
    setHold(next);
  }
  function applyRest(next: RestTimer | null) {
    restRef.current = next;
    setRest(next);
  }

  const reload = useCallback(async () => {
    const w = await fetchWorkout(workoutId);
    workoutRef.current = w;
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

  // "prev: …" hints: fetched once per exercise id, i.e. on load and when an
  // exercise is added -- not on every reload. A failure just means no hints.
  const exerciseIdsKey = workout ? Array.from(new Set(workout.exercises.map((e) => e.exerciseId))).sort().join(',') : '';
  useEffect(() => {
    if (!exerciseIdsKey) return;
    const missing = exerciseIdsKey.split(',').filter((id) => !prevRequestedRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => prevRequestedRef.current.add(id));
    fetchPreviousSetsForExercises(missing)
      .then((byId) => setPrevByExercise((p) => ({ ...p, ...byId })))
      .catch(() => missing.forEach((id) => prevRequestedRef.current.delete(id)));
  }, [exerciseIdsKey]);

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
  /** Stop (without completing) any hold aimed at one of these rows. */
  function clearHoldFor(rowIds: readonly string[]) {
    const target = holdTargetRowId(holdRef.current);
    if (target && rowIds.includes(target)) applyHold(IDLE);
  }

  // ---- completing ----
  /** Best effort: persist edits on other completed rows that never blurred. */
  async function flushDirtyCompleted(exceptId: string | null) {
    const w = workoutRef.current;
    if (!w) return;
    for (const d of dirtyCompletedSets(w.exercises, draftsRef.current)) {
      if (d.id !== exceptId) await updateSet(d.id, d.values);
    }
  }

  function completeRow(setId: string, overrideDurationS?: number, viaTimer = false): Promise<void> {
    const pending = inFlightRef.current.get(setId);
    if (pending) return pending; // single-shot per row
    const gen = holdGenRef.current;
    const w = workoutRef.current;
    const found = w && findSet(w, setId);
    if (!found || found.set.completedAt) return Promise.resolve();
    const kind = kindOf(found.exercise);
    const values = { ...(draftsRef.current[setId] ?? valuesOf(found.set)), ...(overrideDurationS != null ? { durationS: overrideDurationS } : {}) };
    const missing = missingRequiredField(kind, values);
    if (missing) {
      setHints((h) => ({ ...h, [setId]: missing }));
      return Promise.resolve();
    }
    setHints((h) => {
      const { [setId]: _, ...rest } = h;
      return rest;
    });

    const run = (async () => {
      try {
        await updateSet(setId, { ...values, completedAt: new Date().toISOString() });
        setDrafts((d) => ({ ...d, [setId]: values }));
        await flushDirtyCompleted(setId).catch(() => {}); // Finish flushes again
        const fresh = await reload();
        // The user touched the hold timer meanwhile (e.g. started another
        // hold): leave their timer alone and start nothing.
        if (holdGenRef.current !== gen) return;
        const again = findSet(fresh, setId);
        const partner = again ? rightPartner(again.exercise, again.set) : null;
        if (partner && viaTimer && kind === 'hold') {
          applyRest(null);
          applyHold(startSwitch(partner.id, (draftsRef.current[partner.id] ?? valuesOf(partner)).durationS ?? 30, Date.now()));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } else if (!partner) {
          applyRest(startRest(defaultRestSeconds(kind), Date.now()));
        }
      } catch (err) {
        reportError(err, 'Could not save that set.');
      } finally {
        inFlightRef.current.delete(setId);
      }
    })();
    inFlightRef.current.set(setId, run);
    return run;
  }

  async function uncompleteRow(setId: string) {
    try {
      await updateSet(setId, { completedAt: null });
      await reload();
    } catch (err) {
      reportError(err, 'Could not update that set.');
    }
  }

  async function commitEdit(setId: string, explicit?: SetValues) {
    const w = workoutRef.current;
    const found = w && findSet(w, setId);
    if (!found || !found.set.completedAt) return; // incomplete rows persist on ✓
    const values = explicit ?? draftsRef.current[setId];
    if (!values) return;
    try {
      await updateSet(setId, values);
      await reload();
    } catch (err) {
      reportError(err, 'Could not save that edit.');
    }
  }

  function toggleComplete(set: WorkoutSetRow) {
    if (set.completedAt) {
      clearHoldFor([set.id]);
      uncompleteRow(set.id);
      return;
    }
    const cur = holdRef.current;
    if (cur.phase === 'holding' && cur.rowId === set.id) {
      // ✓ mid-hold = "I'm done": complete with the elapsed time, once.
      stopHoldNow();
      return;
    }
    clearHoldFor([set.id]);
    completeRow(set.id);
  }

  // ---- timers ----
  const timerActive = hold.phase !== 'idle' || rest !== null;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      const t = Date.now();
      const cur = holdRef.current;
      const { timer, event } = tickHold(cur, t);
      if (timer !== cur) applyHold(timer);
      if (event && event.type === 'hold_completed') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        completeRow(event.rowId, event.durationS, true);
      }
      const r = restRef.current;
      if (r && restRemainingS(r, t) === 0) {
        applyRest(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  function startHoldFor(set: WorkoutSetRow) {
    const t = Date.now();
    // Starting a new hold finishes any running one with its elapsed time --
    // a manual stop: no success haptic, no switch, and (because the hold
    // generation changes right below) no rest either.
    const stopped = stopHold(holdRef.current, t);
    if (stopped.event && stopped.event.type === 'hold_completed') {
      completeRow(stopped.event.rowId, stopped.event.durationS, false);
    }
    applyRest(null);
    const target = (draftsRef.current[set.id] ?? valuesOf(set)).durationS ?? 30;
    applyHold(startHold(set.id, target, t));
  }

  function stopHoldNow() {
    const cur = holdRef.current;
    if (cur.phase === 'idle') return; // the tick already completed it
    const { event } = stopHold(cur, Date.now());
    applyHold(IDLE);
    // Manual stop: complete with elapsed time but do NOT auto-switch sides.
    if (event && event.type === 'hold_completed') completeRow(event.rowId, event.durationS, false);
  }

  function timerLabelFor(setId: string): ((now: number) => string) | null {
    const h = hold;
    if (h.phase === 'lead_in' && h.rowId === setId) return (n) => `Get ready ${holdRemainingS(h, n)}`;
    if (h.phase === 'holding' && h.rowId === setId) return (n) => formatSeconds(holdRemainingS(h, n));
    if (h.phase === 'switching' && h.nextRowId === setId) return (n) => `Switch sides ${holdRemainingS(h, n)}`;
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
  function openFinish() {
    Keyboard.dismiss();
    // A running hold is completed with its elapsed time rather than dropped;
    // a lead-in or switch countdown simply stops.
    const cur = holdRef.current;
    if (cur.phase !== 'idle') {
      const { event } = stopHold(cur, Date.now());
      applyHold(IDLE);
      if (event && event.type === 'hold_completed') completeRow(event.rowId, event.durationS, false);
    }
    setFinishOpen(true);
  }
  const openFinishRef = useRef(openFinish);
  openFinishRef.current = openFinish;

  async function handleSave(input: FinishInput) {
    setSaving(true);
    try {
      Keyboard.dismiss();
      // Let any ✓ still in flight land first, or its set would be deleted as
      // "uncompleted" below.
      await Promise.all(Array.from(inFlightRef.current.values()));
      let fresh = await reload();
      // Edits on completed rows that never blurred (number pads have no
      // Return key) are only in drafts -- write them before saving.
      const dirty = dirtyCompletedSets(fresh.exercises, draftsRef.current);
      if (dirty.length > 0) {
        for (const d of dirty) await updateSet(d.id, d.values);
        fresh = await reload();
      }
      const result = await finishWorkout(fresh, input);
      if (result === 'no_completed_sets') {
        Alert.alert('No sets completed', 'Tick at least one set, or discard this workout.', [
          { text: 'Keep logging', style: 'cancel', onPress: () => setFinishOpen(false) },
          { text: 'Discard', style: 'destructive', onPress: handleDiscardConfirmed },
        ]);
        return;
      }
      applyHold(IDLE);
      applyRest(null);
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
      applyHold(IDLE);
      applyRest(null);
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

  // Stable header options: the header no longer re-renders on every tick.
  const headerTitle = workout?.title ?? 'Workout';
  const painPointId = workout?.painPointId ?? null;
  const screenOptions = useMemo(
    () => ({
      title: headerTitle,
      headerRight: () => (
        <View style={styles.headerRight}>
          {painPointId && (
            <Pressable onPress={() => setAssessmentOpen(true)} hitSlop={8} accessibilityLabel="Last assessment">
              <Ionicons name="clipboard-outline" size={20} color={COLORS.accent} />
            </Pressable>
          )}
          <Pressable onPress={() => openFinishRef.current()} hitSlop={8}>
            <Text style={styles.finish}>Finish</Text>
          </Pressable>
        </View>
      ),
    }),
    [headerTitle, painPointId]
  );

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
      <Stack.Screen options={screenOptions} />
      <ScrollView
        contentContainerStyle={[sharedStyles.screenContent, styles.bottomPad]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {workout.exercises.length === 0 && (
          <Text style={sharedStyles.helperText}>No exercises yet — add one below.</Text>
        )}
        {workout.exercises.map((exercise) => {
          const kind = kindOf(exercise);
          const previous = prevByExercise[exercise.exerciseId] ?? [];
          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              unit={unit}
              onAddSet={() => run(() => addSet(exercise), 'Could not add a set.')}
              onToggleRom={() => run(() => setMeasureRom(exercise.id, !exercise.measureRom), 'Could not update.')}
              onRemove={() => {
                clearHoldFor(exercise.sets.map((s) => s.id));
                run(() => removeWorkoutExercise(exercise.id), 'Could not remove that exercise.');
              }}
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
                    onCommitEdit={(values) => commitEdit(set.id, values)}
                    onToggleComplete={() => toggleComplete(set)}
                    onToggleWarmup={() =>
                      run(() => updateSet(set.id, { setType: set.setType === 'warmup' ? 'working' : 'warmup' }), 'Could not update.')
                    }
                    onDelete={() => {
                      clearHoldFor([set.id]);
                      run(() => deleteSet(set.id), 'Could not delete that set.');
                    }}
                    timerLabel={timerLabelFor(set.id)}
                    onStartHold={kind === 'hold' && !set.completedAt && !isTimerRow ? () => startHoldFor(set) : null}
                    onStopHold={isTimerRow ? stopHoldNow : null}
                    hint={hints[set.id] ?? null}
                    prevHint={previousHint({ setNumber: set.setNumber, side: set.side }, previous, kind, unit)}
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
        <Ticker>
          {(now) => (
            <RestBar
              remainingS={restRemainingS(rest, now)}
              onMinus={() => restRef.current && applyRest(adjustRest(restRef.current, -15, Date.now()))}
              onPlus={() => restRef.current && applyRest(adjustRest(restRef.current, 15, Date.now()))}
              onSkip={() => applyRest(null)}
            />
          )}
        </Ticker>
      )}
      <ExercisePickerSheet visible={pickerOpen} catalog={catalog} onPick={pickExercise} onClose={() => setPickerOpen(false)} />
      <LastAssessmentSheet visible={assessmentOpen} painPointId={painPointId} onClose={() => setAssessmentOpen(false)} />
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  finish: { ...TYPE.label, color: COLORS.accent, fontWeight: '700' },
  bottomPad: { paddingBottom: 120 },
});
