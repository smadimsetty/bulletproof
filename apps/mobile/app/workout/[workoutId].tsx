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
//   through applyHold/applyRest. userHoldGenRef is bumped only when the user
//   starts a hold (startHoldFor).
// - A row's completion is single-shot: inFlightRef holds the pending
//   completion per row id, and a second completion of the same id is ignored.
// - Manual ✓ / un-tick / × on a row first stops any hold aimed at that row.
// - After a completion's writes resolve, switch-sides / rest only start if
//   the user didn't start a new hold in the meantime (userHoldGenRef
//   unchanged), so a hold they just started is never clobbered. The tick's own
//   state changes (lead-in -> holding -> done) must NOT count, or the rest bar
//   after a timed hold would be skipped.
// - Side effects (haptics, completions) run outside state updaters.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import {
  addExercisesToWorkout, addSet, deleteSet, discardWorkout, fetchExerciseCatalog, fetchPreviousSetsForExercises,
  fetchWorkout, finishWorkout, removeWorkoutExercise, setMeasureRom, setRomUnitForExercise, updateSet,
  type FinishInput, type Workout, type WorkoutExerciseRow, type WorkoutSetRow,
} from '../../lib/workouts';
import { defaultRestSeconds, fieldsForExercise, missingRequiredField, type RomUnit, type SetValues } from '../../lib/setFields';
import { dirtyCompletedSets } from '../../lib/finishPlan';
import { previousHint, type PreviousSet } from '../../lib/previousValues';
import {
  IDLE, adjustRest, holdRemainingS, holdTargetRowId, restRemainingS, startHold, startRest, startSwitch, stopHold,
  tickHold, type HoldTimer, type RestTimer,
} from '../../lib/workoutTimers';
import { formatSeconds } from '../../lib/setFormatting';
import { applyPending, runOptimistic, withoutSet, withSetCompleted, type PendingOp } from '../../lib/optimisticSets';
import { fetchWeightUnit } from '../../lib/userPreferences';
import type { WeightUnit } from '../../lib/units';
import { takePendingPickedExercise, type LibraryExercise } from '../../lib/library';
import SetRow, { SetColumnHeader } from '../../components/logger/SetRow';
import ExerciseCard from '../../components/logger/ExerciseCard';
import RestBar from '../../components/logger/RestBar';
import Ticker from '../../components/logger/Ticker';
import ExercisePickerSheet from '../../components/logger/ExercisePickerSheet';
import FinishSheet from '../../components/logger/FinishSheet';
import { ToastProvider, useToast } from '../../components/Toast';
import { fetchStatsDataset } from '../../lib/stats/dataset';
import { computePrEvents, isNewBest, prKey, setCandidates, type Bests } from '../../lib/stats/prs';
import { PR_KIND_LABEL, prHeadline, sideSuffix } from '../../lib/stats/format';
import { kgToDisplayUnit } from '../../lib/units';
import LastAssessmentSheet from '../../components/LastAssessmentSheet';
import { fetchUserSettings, type Visibility } from '../../lib/userSettings';
import { fetchMyProfile } from '../../lib/social/profiles';
import { initialVisibility } from '../../lib/social/visibility';
import { uploadWorkoutPhotos } from '../../lib/social/media';
import { ensurePushRegistered } from '../../lib/social/push';
import { saveWorkoutToHealth } from '../../lib/healthkitWrite';
import { syncWorkoutLiveActivity } from '../../lib/workoutActivityBridge';
import { dominantKind } from '../../lib/workoutKind';
import { Button, ConfirmSheet, EmptyState, ErrorState, IconButton, SkeletonCard } from '../../components/ui';
import { formatClock } from '../../components/ui/TimerDisplay';

function LoggerHeader({
  title,
  onMinimise,
  onAssessment,
  onFinish,
}: {
  title: string;
  onMinimise: () => void;
  onAssessment?: (() => void) | null;
  onFinish?: (() => void) | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
      <IconButton icon="chevron-down" accessibilityLabel="Minimise workout" onPress={onMinimise} />
      <Text style={[TYPE.title3, styles.headerTitle]} numberOfLines={1}>
        {title}
      </Text>
      {onAssessment ? <IconButton icon="clipboard-outline" accessibilityLabel="Last assessment" onPress={onAssessment} /> : null}
      {onFinish ? <Button title="Finish" size="sm" onPress={onFinish} /> : null}
    </View>
  );
}

function valuesOf(s: WorkoutSetRow): SetValues {
  return { reps: s.reps, weightKg: s.weightKg, durationS: s.durationS, romValue: s.romValue, romUnit: s.romUnit };
}

// A native fullScreenModal covers the root ToastProvider overlay, so the logger mounts its own
// provider inside the modal; otherwise PR and error toasts would render behind the screen.
export default function LoggerScreen() {
  return (
    <ToastProvider>
      <Logger />
    </ToastProvider>
  );
}

function Logger() {
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
  const [catalog, setCatalog] = useState<LibraryExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // True when the discard sheet was opened because Finish found no completed sets.
  const [discardNoSets, setDiscardNoSets] = useState(false);
  const discardingRef = useRef(false);
  // Sets that beat a previous best this session (SetRow shows a trophy). Presentation only.
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  // Sets completed by the hold timer: its own success haptic plays, so the row stays quiet.
  const [timerDoneIds, setTimerDoneIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  // Finish-sheet defaults; best effort. Until the user's real default loads
  // (or if it never does) fall back to Private: posting to followers is
  // something the user must choose, never something a slow network chooses.
  const [postDefaults, setPostDefaults] = useState<{ visibility: Visibility; profileIsPublic: boolean }>({
    visibility: 'private',
    profileIsPublic: false,
  });
  // Refs so timer callbacks (created in an older render) read current state.
  const workoutRef = useRef<Workout | null>(null);
  workoutRef.current = workout;
  const draftsRef = useRef<Record<string, SetValues>>({});
  draftsRef.current = drafts;
  const holdRef = useRef<HoldTimer>(IDLE);
  const userHoldGenRef = useRef(0);
  const restRef = useRef<RestTimer | null>(null);
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  // Optimistic set changes (tick, un-tick, delete) whose write has not landed; a reload re-lays them
  // over the fetched workout so it can never flash the old state back.
  const pendingRef = useRef<Map<string, PendingOp>>(new Map());
  /** Swap in a new workout synchronously (ref first, so same-tick readers agree with the screen). */
  function setWorkoutNow(next: Workout) {
    workoutRef.current = next;
    setWorkout(next);
  }
  const prevRequestedRef = useRef<Set<string>>(new Set());
  const toast = useToast();
  // In-app toast, not a system Alert, so errors look like the rest of the app.
  function reportError(err: any, fallback: string) {
    toast.show({ message: err?.message ?? fallback, tone: 'danger' });
  }
  // Prior bests from FINISHED workouts only (the in-progress one is excluded by
  // construction), and what this session has already toasted per key.
  const bestsRef = useRef<Bests>(new Map());
  const toastedRef = useRef<Bests>(new Map());

  function applyHold(next: HoldTimer) {
    holdRef.current = next;
    setHold(next);
  }
  function applyRest(next: RestTimer | null) {
    restRef.current = next;
    setRest(next);
  }

  const reload = useCallback(async () => {
    const w = applyPending(await fetchWorkout(workoutId), pendingRef.current);
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

  useEffect(() => {
    Promise.all([fetchUserSettings(), fetchMyProfile()])
      .then(([s, p]) => setPostDefaults({ visibility: s.defaultVisibility, profileIsPublic: !!p?.isPublic }))
      .catch(() => undefined);
  }, []);

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

  // PR baselines for the exercises in this workout. A failed load just means no
  // toasts -- never an error.
  useEffect(() => {
    if (!exerciseIdsKey) return;
    let cancelled = false;
    fetchStatsDataset({ exerciseIds: exerciseIdsKey.split(',') })
      .then((dataset) => {
        if (!cancelled) bestsRef.current = computePrEvents(dataset).bests;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

  /** Toast + haptic for each kind this just-completed set newly beats (never throws). */
  function announcePrs(exercise: WorkoutExerciseRow, set: WorkoutSetRow, values: SetValues) {
    try {
      const candidates = setCandidates(exercise.exerciseType, exercise.unilateral, {
        side: set.side, setType: set.setType, reps: values.reps, weightKg: values.weightKg,
        durationS: values.durationS, romValue: values.romValue, romUnit: values.romUnit,
        completedAt: new Date().toISOString(),
      });
      for (const cand of candidates) {
        const key = prKey(exercise.exerciseId, set.side, cand.kind, cand.romUnit);
        if (!isNewBest(bestsRef.current, key, cand)) continue;
        // Toast each key at most once per logger session.
        if (toastedRef.current.has(key)) continue;
        toastedRef.current.set(key, { value: cand.value, reps: cand.reps });
        const unitLabel = cand.kind === 'heaviest_weight' ? 'kg' : cand.kind === 'best_rom' ? (cand.romUnit ?? '') : '';
        const prior = bestsRef.current.get(key);
        const tieReps = cand.kind === 'heaviest_weight' && prior && prior.value === cand.value ? cand.reps : undefined;
        // Celebration: tone 'pr' fires haptics.pr() itself (success, then heavy), so no separate haptic here.
        const tie = tieReps != null;
        const shown = (v: number) => (cand.kind === 'heaviest_weight' && !tie ? kgToDisplayUnit(v, unit) : v);
        const to = tie ? (cand.reps ?? 0) : shown(cand.value);
        const from = tie ? (prior?.reps ?? 0) : prior ? shown(prior.value) : 0;
        const round1 = (n: number) => Math.round(n * 10) / 10;
        toast.show({
          message: `New PR — ${prHeadline(cand.kind, set.side, cand.value, unitLabel, unit, tieReps)}`,
          tone: 'pr',
          pr: {
            label: `${PR_KIND_LABEL[cand.kind]}${sideSuffix(set.side)}`,
            from: round1(from),
            to: round1(to),
            unit: tie ? 'reps' : cand.kind === 'heaviest_weight' ? unit : cand.kind === 'longest_hold' ? 's' : cand.kind === 'most_reps' ? 'reps' : unitLabel,
            decimals: round1(to) % 1 !== 0 || round1(from) % 1 !== 0 ? 1 : 0,
          },
        });
        setPrSetIds((prev) => new Set(prev).add(set.id));
      }
    } catch {
      // PR detection must never break logging.
    }
  }

  function completeRow(setId: string, overrideDurationS?: number, viaTimer = false): Promise<void> {
    const pending = inFlightRef.current.get(setId);
    if (pending) return pending; // single-shot per row
    const gen = userHoldGenRef.current;
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

    if (viaTimer) setTimerDoneIds((prev) => new Set(prev).add(setId));
    const completedAt = new Date().toISOString();
    // The row flips to done right now (state + haptic in SetRow); the write runs behind it and a
    // failure puts the row back with a toast.
    const run = (async () => {
      try {
        const result = await runOptimistic({
          pending: pendingRef.current,
          key: setId,
          op: { kind: 'complete', completedAt, values },
          apply: () => {
            if (workoutRef.current) setWorkoutNow(withSetCompleted(workoutRef.current, setId, completedAt, values));
            setDrafts((d) => ({ ...d, [setId]: values }));
          },
          write: () => updateSet(setId, { ...values, completedAt }),
          revert: () => {
            if (workoutRef.current) setWorkoutNow(withSetCompleted(workoutRef.current, setId, null));
            if (viaTimer) setTimerDoneIds((prev) => { const n = new Set(prev); n.delete(setId); return n; });
          },
        });
        if (result === 'failed') {
          toast.show({ message: 'Could not save that set. It is unticked.', tone: 'danger' });
          return;
        }
        if (result !== 'ok') return;
        announcePrs(found.exercise, found.set, values);
        // Rest / switch start from the local state, not from a refetch.
        if (userHoldGenRef.current === gen && holdRef.current.phase === 'idle') {
          const local = workoutRef.current ? findSet(workoutRef.current, setId) : null;
          const partner = local ? rightPartner(local.exercise, local.set) : null;
          if (partner && viaTimer && kind === 'hold') {
            applyRest(null);
            applyHold(startSwitch(partner.id, (draftsRef.current[partner.id] ?? valuesOf(partner)).durationS ?? 30, Date.now()));
            // Switch-sides heavy tap now fires from TimerDisplay (mode="switch") when its banner mounts.
          } else if (!partner) {
            applyRest(startRest(defaultRestSeconds(kind), Date.now()));
          }
        }
        // Background sync (Finish flushes dirty rows again and reloads before saving).
        await flushDirtyCompleted(setId).catch(() => {});
        await reload();
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
      // A ✓ still writing would land after this and re-complete the row.
      await inFlightRef.current.get(setId);
      const prevCompletedAt = (workoutRef.current && findSet(workoutRef.current, setId)?.set.completedAt) || null;
      const result = await runOptimistic({
        pending: pendingRef.current,
        key: setId,
        op: { kind: 'complete', completedAt: null },
        apply: () => {
          if (workoutRef.current) setWorkoutNow(withSetCompleted(workoutRef.current, setId, null));
        },
        write: () => updateSet(setId, { completedAt: null }),
        revert: () => {
          if (workoutRef.current) setWorkoutNow(withSetCompleted(workoutRef.current, setId, prevCompletedAt));
        },
      });
      if (result === 'failed') toast.show({ message: 'Could not update that set.', tone: 'danger' });
      else if (result === 'ok') await reload();
    } catch (err) {
      reportError(err, 'Could not update that set.');
    }
  }

  /** Remove the row right away, delete in the background, put it back with a toast if that fails. */
  async function deleteSetNow(setId: string) {
    const before = workoutRef.current;
    if (!before) return;
    clearHoldFor([setId]);
    const result = await runOptimistic({
      pending: pendingRef.current,
      key: setId,
      op: { kind: 'remove' },
      apply: () => setWorkoutNow(withoutSet(before, setId)),
      write: () => deleteSet(setId),
      revert: () => {
        reload().catch(() => setWorkoutNow(before));
      },
    });
    if (result === 'failed') toast.show({ message: 'Could not delete that set. It is back.', tone: 'danger' });
    else if (result === 'ok') await reload().catch(() => undefined);
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
        // Hold reached its target: the logger owns this haptic (SetRow/TimerDisplay endHaptics are off).
        haptics.success();
        completeRow(event.rowId, event.durationS, true);
      }
      const r = restRef.current;
      if (r && restRemainingS(r, t) === 0) {
        applyRest(null);
        // Rest ended: success haptic (spec 2.6); the logger owns it because it removes the bar itself.
        haptics.success();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  // ---- lock-screen Live Activity: current exercise + running hold/rest timer ----
  const liveWorkoutId = workout && !workout.endedAt ? workout.id : null;
  const liveTitle = workout?.title ?? '';
  const liveStartedAt = workout?.startedAt ?? '';
  const liveSprintDayId = workout?.sprintDayId ?? null;
  const liveExercise =
    workout?.exercises.find((e) => e.sets.some((s) => !s.completedAt))?.exerciseName ?? '';
  const liveTimer =
    hold.phase === 'lead_in'
      ? { endsAtMs: hold.endsAt + hold.targetS * 1000, label: 'Hold' }
      : hold.phase === 'holding'
        ? { endsAtMs: hold.endsAt, label: 'Hold' }
        : hold.phase === 'switching'
          ? { endsAtMs: hold.endsAt, label: 'Switch sides' }
          : rest
            ? { endsAtMs: rest.endsAt, label: 'Rest' }
            : { endsAtMs: 0, label: '' };
  useEffect(() => {
    if (!liveWorkoutId) return;
    syncWorkoutLiveActivity(
      { id: liveWorkoutId, title: liveTitle, startedAt: liveStartedAt, sprintDayId: liveSprintDayId },
      { exerciseName: liveExercise, timerEndsAtMs: liveTimer.endsAtMs, timerLabel: liveTimer.label }
    );
  }, [liveWorkoutId, liveTitle, liveStartedAt, liveSprintDayId, liveExercise, liveTimer.endsAtMs, liveTimer.label]);

  function startHoldFor(set: WorkoutSetRow) {
    const t = Date.now();
    // Starting a new hold finishes any running one with its elapsed time --
    // a manual stop: no success haptic, no switch, and (because the user hold
    // generation is bumped right below) no rest either.
    const stopped = stopHold(holdRef.current, t);
    if (stopped.event && stopped.event.type === 'hold_completed') {
      completeRow(stopped.event.rowId, stopped.event.durationS, false);
    }
    applyRest(null);
    userHoldGenRef.current += 1; // after completeRow captured its generation above
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

  async function pickExercise(e: LibraryExercise) {
    setPickerOpen(false);
    await run(
      () => addExercisesToWorkout(workoutId, [{ exerciseId: e.id, sprintDayExerciseId: null, targetText: null, prescribedSets: null }]),
      'Could not add that exercise.'
    );
  }

  function createExercise() {
    setPickerOpen(false);
    router.push('/library/new?returnTo=picker');
  }

  // Coming back from "+ Create exercise": add the new exercise to this
  // workout (it was left on the pending-pick channel) and drop the cached
  // catalog so the next picker open includes it.
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingPickedExercise();
      if (!pending) return;
      setCatalog([]);
      run(
        () => addExercisesToWorkout(workoutId, [{ exerciseId: pending, sprintDayExerciseId: null, targetText: null, prescribedSets: null }]),
        'Could not add that exercise.'
      );
    }, [workoutId]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** The ROM unit is per exercise: change every row's draft, persist for the exercise. */
  function changeRomUnit(exercise: WorkoutExerciseRow, romUnit: RomUnit) {
    setDrafts((d) => {
      const next = { ...d };
      for (const s of exercise.sets) next[s.id] = { ...(d[s.id] ?? valuesOf(s)), romUnit };
      return next;
    });
    run(() => setRomUnitForExercise(exercise.id, romUnit), 'Could not change the unit.');
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

  async function handleSave(input: FinishInput, photoUris: string[]) {
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
        setDiscardNoSets(true);
        handleDiscard();
        return;
      }
      applyHold(IDLE);
      applyRest(null);
      setFinishOpen(false);
      // Optional Apple Health write (no-op unless the setting is on; never blocks the finish).
      saveWorkoutToHealth({
        startedAt: fresh.startedAt,
        endedAt: new Date().toISOString(),
        dominantKind: dominantKind(fresh.exercises),
      });
      // First finished workout is a natural moment to ask for push (once, ever).
      ensurePushRegistered({ ask: true });
      // The workout is saved; a photo failure must not undo that, just say so.
      let photoFail = 0;
      if (photoUris.length > 0) {
        // Own try: anything thrown here happens after the save succeeded.
        try {
          const { failed } = await uploadWorkoutPhotos(workoutId, photoUris);
          photoFail = failed;
        } catch {
          photoFail = photoUris.length;
        }
      }
      haptics.success();
      // From a fullScreenModal this swaps the logger for the summary: stack becomes [tabs, summary], back lands on tabs.
      // Photo failures are reported on the summary as a toast (an Alert here would collide with the replace).
      const failParam = photoFail > 0 ? `&photoFail=${photoFail}` : '';
      router.replace(
        workout?.routineId
          ? `/workout-summary/${workoutId}?checkRoutine=1&justFinished=1${failParam}`
          : `/workout-summary/${workoutId}?justFinished=1${failParam}`
      );
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

  // From the Finish sheet: close it, then confirm in a ConfirmSheet once the sheet has finished dismissing
  // (iOS drops overlapping Modal presentations). Cancelling leaves the workout running.
  function handleDiscard() {
    setFinishOpen(false);
    setTimeout(() => setDiscardOpen(true), 300);
  }

  const painPointId = workout?.painPointId ?? null;

  // Minimise: the workout keeps running; the tabs' ActiveWorkoutBanner reopens
  // this same workout. Never discards.
  function minimise() {
    Keyboard.dismiss();
    router.back();
  }

  // ---- render ----
  if (loadError) {
    return (
      <View style={styles.screen}>
        <LoggerHeader title="Workout" onMinimise={minimise} />
        <ErrorState
          message={loadError}
          retrying={retrying}
          onRetry={async () => {
            setRetrying(true);
            try {
              await reload();
              setLoadError(null);
            } catch (e: any) {
              setLoadError(e?.message ?? 'Could not load.');
            } finally {
              setRetrying(false);
            }
          }}
        />
      </View>
    );
  }
  if (!workout) {
    // The header renders immediately; content is skeletons.
    return (
      <View style={styles.screen}>
        <LoggerHeader title="Workout" onMinimise={minimise} />
        <View style={styles.skeletons}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }
  if (workout.endedAt) {
    // The redirect to the summary happens in the effect above.
    return null;
  }

  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => !!s.completedAt).length, 0);
  const startedMs = new Date(workout.startedAt).getTime();
  // The first incomplete set in the workout is "next up".
  const nextUpId = workout.exercises.flatMap((e) => e.sets).find((s) => !s.completedAt)?.id ?? null;

  return (
    <View style={styles.screen}>
      <LoggerHeader
        title={workout.title}
        onMinimise={minimise}
        onAssessment={painPointId ? () => setAssessmentOpen(true) : null}
        onFinish={() => openFinishRef.current()}
      />
      <Ticker intervalMs={1000}>
        {(now) => (
          <Text style={[TYPE.footnote, styles.summary]}>
            {`${formatClock(Math.max(0, now - startedMs))} elapsed · ${workout.exercises.length} ${
              workout.exercises.length === 1 ? 'exercise' : 'exercises'
            } · ${doneSets}/${totalSets} sets`}
          </Text>
        )}
      </Ticker>
      <ScrollView
        contentContainerStyle={[styles.content, styles.bottomPad]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        indicatorStyle="white"
      >
        {workout.exercises.length === 0 && (
          <EmptyState
            icon="add-circle-outline"
            title="Add your first exercise"
            body="Pick from the library or create your own."
            action={{ label: 'Add exercise', onPress: openPicker }}
          />
        )}
        {workout.exercises.map((exercise) => {
          const kind = kindOf(exercise);
          const previous = prevByExercise[exercise.exerciseId] ?? [];
          return (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              columnHeader={<SetColumnHeader kind={kind} unit={unit} />}
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
                    onChangeRomUnit={(u) => changeRomUnit(exercise, u)}
                    onToggleComplete={() => toggleComplete(set)}
                    onToggleWarmup={() =>
                      run(() => updateSet(set.id, { setType: set.setType === 'warmup' ? 'working' : 'warmup' }), 'Could not update.')
                    }
                    onDelete={() => deleteSetNow(set.id)}
                    timerLabel={timerLabelFor(set.id)}
                    onStartHold={kind === 'hold' && !set.completedAt && !isTimerRow ? () => startHoldFor(set) : null}
                    onStopHold={isTimerRow ? stopHoldNow : null}
                    hint={hints[set.id] ?? null}
                    prevHint={previousHint({ setNumber: set.setNumber, side: set.side }, previous, kind, unit)}
                    timer={hold}
                    isNextUp={set.id === nextUpId}
                    isPr={prSetIds.has(set.id)}
                    quietComplete={prSetIds.has(set.id) || timerDoneIds.has(set.id)}
                  />
                );
              }}
            />
          );
        })}
        {workout.exercises.length > 0 ? (
          <>
            <Button title="Add exercise" icon="add" variant="secondary" size="lg" fullWidth onPress={openPicker} />
            <Button title="Discard workout" variant="destructive" size="sm" onPress={() => setDiscardOpen(true)} style={styles.discard} />
          </>
        ) : null}
      </ScrollView>
      {rest && (
        <Ticker>
          {(now) => (
            <RestBar
              remainingS={restRemainingS(rest, now)}
              totalS={rest.totalS}
              onMinus={() => restRef.current && applyRest(adjustRest(restRef.current, -15, Date.now()))}
              onPlus={() => restRef.current && applyRest(adjustRest(restRef.current, 15, Date.now()))}
              onSkip={() => applyRest(null)}
            />
          )}
        </Ticker>
      )}
      <ExercisePickerSheet visible={pickerOpen} catalog={catalog} onPick={pickExercise} onClose={() => setPickerOpen(false)} onCreate={createExercise} />
      <LastAssessmentSheet visible={assessmentOpen} painPointId={painPointId} onClose={() => setAssessmentOpen(false)} />
      <FinishSheet
        visible={finishOpen}
        initialTitle={workout.title}
        isSprint={workout.source === 'sprint'}
        defaultVisibility={initialVisibility(workout.source === 'sprint', postDefaults.visibility, postDefaults.profileIsPublic)}
        canPublic={postDefaults.profileIsPublic}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onClose={() => setFinishOpen(false)}
        stats={{ time: formatClock(Math.max(0, Date.now() - startedMs)), exercises: workout.exercises.length, sets: doneSets }}
      />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => {
          setDiscardOpen(false);
          setDiscardNoSets(false);
        }}
        title={discardNoSets ? "No sets completed" : "Discard workout?"}
        body={discardNoSets ? "Tick at least one set to finish, or discard this workout. Every set logged in it will be deleted." : "Every set logged in it will be deleted."}
        confirmLabel="Discard"
        cancelLabel={discardNoSets ? "Keep logging" : "Cancel"}
        destructive
        onConfirm={() => {
          if (discardingRef.current) return;
          discardingRef.current = true;
          setDiscardOpen(false);
          void handleDiscardConfirmed().finally(() => {
            discardingRef.current = false;
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.bg,
  },
  headerTitle: { flex: 1 },
  summary: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, fontVariant: ['tabular-nums'] },
  skeletons: { padding: SPACING.lg, gap: SPACING.md },
  content: { padding: SPACING.lg, gap: SPACING.md },
  bottomPad: { paddingBottom: 120 },
  discard: { alignSelf: 'center' },
});
