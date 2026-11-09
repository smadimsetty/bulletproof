// One logged-set row (visual spec 3 "SetRow"). Inputs hold local text while typing (so "4." or an
// empty field never fights the user) and are re-seeded from the draft prop
// whenever the field is not focused.
//
// Presentation only: every handler arrives as a prop from app/workout/[workoutId].tsx and is
// called exactly as before. States: idle, next-up, active hold timer (expanded), completed,
// warm-up, PR. Haptics: the Rigid tap fires when `set.completedAt` flips to set (so it also
// covers completions that come from the hold timer). Timer haptics are owned by TimerDisplay
// (last 3 s, switch prompt) and the logger (hold complete, rest end); see the logger header note.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, RADII, SPACING, TYPE } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import type { WorkoutSetRow } from '../../lib/workouts';
import type { RomUnit, SetKind, SetValues } from '../../lib/setFields';
import type { HoldTimer } from '../../lib/workoutTimers';
import Ticker from './Ticker';
import SwipeToDelete from '../SwipeToDelete';
import { NumberField, PressableScale, TimerDisplay } from '../ui';
import { displayUnitToKg, formatWeightForDisplay, type WeightUnit } from '../../lib/units';

export interface SetRowProps {
  set: WorkoutSetRow;
  kind: SetKind;
  measureRom: boolean;
  unit: WeightUnit;
  draft: SetValues;
  onChange: (next: SetValues) => void;
  /** Persist an edit on a completed row; explicit values beat the (possibly not yet rendered) draft. */
  onCommitEdit: (values?: SetValues) => void;
  /** ROM unit is per exercise, so the parent updates every row of it. */
  onChangeRomUnit: (unit: RomUnit) => void;
  onToggleComplete: () => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  /** Countdown text for this row at a given time; null when no timer targets it. */
  timerLabel: ((now: number) => string) | null;
  onStartHold: (() => void) | null;
  onStopHold: (() => void) | null;
  hint: string | null;
  /** Muted "prev: …" from the last saved workout with this exercise. */
  prevHint: string | null;
  /** The logger's hold timer (any phase); the row picks out the phases that target it. */
  timer?: HoldTimer | null;
  /** First incomplete set in the workout: lights up with an accent bar. */
  isNextUp?: boolean;
  /** This set beat a previous best during this logger session. */
  isPr?: boolean;
  /** Skip the completion haptic: the hold timer or a PR toast already plays its own. */
  quietComplete?: boolean;
}

const ROM_CYCLE: Record<RomUnit, RomUnit> = { cm: 'deg', deg: 'in', in: 'cm' };

function sameNumber(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.trim() === '' || b.trim() === '') return false;
  return Number(a) === Number(b);
}

function parseNumber(text: string, integer: boolean): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return integer ? Math.trunc(n) : n;
}

// ---- column layout shared with the header row ----
const SET_COL = 32;
const CHECK_COL = 44;
const FIELD_W = 64;
const HOLD_FIELD_W = 72;
const TIME_FIELD_W = 56;

/** Column header above the set rows: SET / PREVIOUS / <inputs> / check. */
export function SetColumnHeader({ kind, unit }: { kind: SetKind; unit: WeightUnit }) {
  const cols: { label: string; width: number }[] =
    kind === 'weight_reps'
      ? [{ label: unit.toUpperCase(), width: FIELD_W }, { label: 'REPS', width: FIELD_W }]
      : kind === 'reps'
        ? [{ label: 'REPS', width: HOLD_FIELD_W }]
        : kind === 'hold'
          ? [{ label: 'SECONDS', width: HOLD_FIELD_W + SPACING.sm + 36 }]
          : [{ label: 'TIME', width: TIME_FIELD_W * 2 + SPACING.sm }];
  return (
    <View style={styles.headerRow}>
      <Text style={[TYPE.caption, { width: SET_COL }]}>SET</Text>
      <Text style={[TYPE.caption, styles.flex]}>PREVIOUS</Text>
      {cols.map((c) => (
        <Text key={c.label} style={[TYPE.caption, { width: c.width, textAlign: 'center' }]}>
          {c.label}
        </Text>
      ))}
      <Text style={[TYPE.caption, { width: CHECK_COL, textAlign: 'center' }]}>✓</Text>
    </View>
  );
}

interface NumFieldProps {
  display: string;
  onText: (text: string) => void;
  onCommit: () => void;
  decimal?: boolean;
  placeholder?: string;
  width?: number;
}

function NumField({ display, onText, onCommit, decimal = false, placeholder, width = FIELD_W }: NumFieldProps) {
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText((prev) => (sameNumber(prev, display) ? prev : display));
  }, [display, focused]);
  return (
    <NumberField
      value={text}
      placeholder={placeholder}
      decimal={decimal}
      width={width}
      onFocus={() => setFocused(true)}
      onChangeText={(t) => {
        setText(t);
        onText(t);
      }}
      onEndEditing={() => {
        setFocused(false);
        onCommit();
      }}
    />
  );
}

// 0 = idle, 1 = next-up / completed warm-up, 2 = completed working set.
const BG_STOPS = ['rgba(30,33,40,0)', COLORS.elevated, COLORS.accentTint];

export default function SetRow(props: SetRowProps) {
  const { set, kind, measureRom, unit, draft, onChange, onCommitEdit, timerLabel, onStartHold, onStopHold, hint, prevHint, timer, isNextUp, isPr, quietComplete } = props;
  const quietRef = useRef(quietComplete);
  quietRef.current = quietComplete;
  const reduced = useReducedMotion();
  const commit = () => onCommitEdit();
  const completed = !!set.completedAt;
  const warmup = set.setType === 'warmup';
  const romUnit: RomUnit = draft.romUnit ?? 'cm';
  const sideLetter = set.side === 'left' ? 'L' : set.side === 'right' ? 'R' : null;
  const sideColor = set.side === 'left' ? COLORS.chartLeft : COLORS.chartRight;
  const prevText = prevHint ? prevHint.replace(/^prev:\s*/, '') : '';

  const duration = draft.durationS;
  const minutes = duration == null ? '' : String(Math.floor(duration / 60));
  const seconds = duration == null ? '' : String(duration % 60);
  const combine = (mText: string, sText: string) => {
    if (mText.trim() === '' && sText.trim() === '') return null;
    return (parseNumber(mText, true) ?? 0) * 60 + (parseNumber(sText, true) ?? 0);
  };

  const timerRowActive = timer != null && (timer.phase === 'lead_in' || timer.phase === 'holding') && timer.rowId === set.id;
  const switchTarget = timer != null && timer.phase === 'switching' && timer.nextRowId === set.id ? timer : null;

  // ---- row background + check pop ----
  const state = completed ? (warmup ? 1 : 2) : isNextUp || timerRowActive ? 1 : 0;
  const bg = useSharedValue(state);
  useEffect(() => {
    bg.value = reduced ? state : withTiming(state, { duration: MOTION.base });
  }, [state, reduced, bg]);
  const rowStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(bg.value, [0, 1, 2], BG_STOPS) }));

  const pop = useSharedValue(1);
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (completed && !wasCompleted.current) {
      if (!quietRef.current) haptics.rigid();
      if (!reduced) {
        pop.value = 0.6;
        pop.value = withSpring(1, { ...MOTION.popSpring });
      }
    }
    wasCompleted.current = completed;
  }, [completed, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const labelCircle = (
    <PressableScale
      onLongPress={props.onToggleWarmup}
      delayLongPress={400}
      haptic="none"
      hitSlop={6}
      accessibilityLabel={warmup ? 'Warm-up set, long press to make a working set' : 'Working set, long press to mark as warm-up'}
      style={[
        styles.labelCircle,
        warmup ? { backgroundColor: COLORS.warningTint } : completed ? { backgroundColor: COLORS.accent } : { backgroundColor: COLORS.elevated },
        !completed && isNextUp && !warmup ? { borderWidth: 1, borderColor: COLORS.accent } : null,
      ]}
    >
      <Text
        style={[
          TYPE.callout,
          styles.labelText,
          { color: warmup ? COLORS.warning : completed ? COLORS.onAccent : COLORS.textSecondary },
        ]}
        maxFontSizeMultiplier={1.2}
      >
        {warmup ? 'W' : String(set.setNumber)}
        {sideLetter ? <Text style={[styles.sideLetter, { color: warmup || completed ? undefined : sideColor }]}>{sideLetter}</Text> : null}
      </Text>
    </PressableScale>
  );

  const checkButton = (
    <PressableScale
      onPress={() => {
        // Completing fires its Rigid tap when the completion lands (see above); un-ticking is a plain tap.
        if (completed) haptics.tap();
        props.onToggleComplete();
      }}
      haptic="none"
      scaleTo={0.9}
      hitSlop={4}
      style={styles.checkHit}
      accessibilityLabel={completed ? 'Mark set incomplete' : 'Mark set complete'}
    >
      <Animated.View style={[styles.check, completed ? styles.checkDone : null, popStyle]}>
        {completed ? <Ionicons name="checkmark" size={20} color={COLORS.onAccent} /> : null}
      </Animated.View>
    </PressableScale>
  );

  // ---- expanded hold timer ----
  if (timerRowActive && timer) {
    return (
      <View>
        <Animated.View style={[styles.activeRow, rowStyle]}>
          {timer.phase === 'holding' ? (
            <Ticker intervalMs={200}>
              {(now) => (
                <TimerDisplay
                  mode="hold"
                  elapsedMs={Math.max(0, now - timer.startedAt)}
                  targetMs={timer.targetS * 1000}
                  onStop={onStopHold ?? undefined}
                  // The logger fires the hold-complete success haptic from its own tick.
                  endHaptics={false}
                />
              )}
            </Ticker>
          ) : (
            <View style={styles.leadIn}>
              <Ticker intervalMs={200}>
                {(now) => (
                  <Text style={styles.leadInText} maxFontSizeMultiplier={1.2}>
                    {timerLabel ? timerLabel(now) : 'Get ready'}
                  </Text>
                )}
              </Ticker>
              {onStopHold ? (
                <PressableScale onPress={onStopHold} style={styles.stopBtn} accessibilityLabel="Stop">
                  <Text style={[TYPE.callout, { color: COLORS.textPrimary }]}>Stop</Text>
                </PressableScale>
              ) : null}
            </View>
          )}
        </Animated.View>
        {hint ? <HintLine text={hint} /> : null}
      </View>
    );
  }

  return (
    <View>
      {switchTarget ? (
        <Ticker intervalMs={200}>
          {(now) => (
            <TimerDisplay
              mode="switch"
              remainingMs={Math.max(0, switchTarget.endsAt - now)}
              toSide={set.side === 'left' ? 'LEFT' : 'RIGHT'}
              style={styles.switchBanner}
            />
          )}
        </Ticker>
      ) : null}
      <SwipeToDelete onDelete={props.onDelete}>
        <Animated.View
          style={[styles.row, rowStyle]}
        >
          {isNextUp && !completed ? <View style={styles.nextBar} pointerEvents="none" /> : null}
          <View style={styles.setCol}>{labelCircle}</View>
          <Text style={[TYPE.footnote, styles.flex, styles.prev]} numberOfLines={1}>
            {prevText}
          </Text>

          {kind === 'weight_reps' && (
            <>
              <NumField
                display={formatWeightForDisplay(draft.weightKg, unit)}
                decimal
                placeholder={unit}
                onText={(t) => {
                  const n = parseNumber(t, false);
                  onChange({ ...draft, weightKg: n == null ? null : displayUnitToKg(n, unit) });
                }}
                onCommit={commit}
              />
              <NumField
                display={draft.reps == null ? '' : String(draft.reps)}
                placeholder="reps"
                onText={(t) => onChange({ ...draft, reps: parseNumber(t, true) })}
                onCommit={commit}
              />
            </>
          )}

          {kind === 'reps' && (
            <NumField
              display={draft.reps == null ? '' : String(draft.reps)}
              width={HOLD_FIELD_W}
              placeholder="reps"
              onText={(t) => onChange({ ...draft, reps: parseNumber(t, true) })}
              onCommit={commit}
            />
          )}

          {kind === 'hold' && (
            <>
              <NumField
                display={duration == null ? '' : String(duration)}
                width={HOLD_FIELD_W}
                placeholder="sec"
                onText={(t) => onChange({ ...draft, durationS: parseNumber(t, true) })}
                onCommit={commit}
              />
              {onStartHold ? (
                <PressableScale onPress={onStartHold} hitSlop={4} style={styles.holdBtn} accessibilityLabel="Start hold timer">
                  <Ionicons name="play" size={16} color={COLORS.accent} />
                </PressableScale>
              ) : (
                <View style={styles.holdBtn} />
              )}
            </>
          )}

          {kind === 'duration' && (
            <>
              <NumField
                display={minutes}
                width={TIME_FIELD_W}
                placeholder="mm"
                onText={(t) => onChange({ ...draft, durationS: combine(t, seconds) })}
                onCommit={commit}
              />
              <NumField
                display={seconds}
                width={TIME_FIELD_W}
                placeholder="ss"
                onText={(t) => onChange({ ...draft, durationS: combine(minutes, t) })}
                onCommit={commit}
              />
            </>
          )}

          {isPr && completed ? <Ionicons name="trophy" size={14} color={COLORS.accent} accessibilityLabel="Personal record" /> : null}
          {checkButton}
        </Animated.View>
      </SwipeToDelete>

      {measureRom && (
        <View style={styles.romRow}>
          <Text style={TYPE.caption}>ROM</Text>
          <NumField
            display={draft.romValue == null ? '' : String(draft.romValue)}
            decimal
            placeholder="ROM"
            onText={(t) => onChange({ ...draft, romValue: parseNumber(t, false), romUnit })}
            onCommit={commit}
          />
          <PressableScale haptic="select" hitSlop={6} onPress={() => props.onChangeRomUnit(ROM_CYCLE[romUnit])} accessibilityLabel={`ROM unit ${romUnit}, tap to change`}>
            <Text style={[TYPE.callout, { color: COLORS.accent, fontWeight: '700' }]}>{romUnit}</Text>
          </PressableScale>
        </View>
      )}
      {hint ? <HintLine text={hint} /> : null}
    </View>
  );
}

function HintLine({ text }: { text: string }) {
  return (
    <View style={styles.hint}>
      <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
      <Text style={[TYPE.footnote, { color: COLORS.danger }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.sm,
    overflow: 'hidden',
  },
  nextBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.accent },
  setCol: { width: SET_COL, alignItems: 'flex-start' },
  labelCircle: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  labelText: { fontWeight: '700', lineHeight: 18 },
  sideLetter: { fontSize: 14, fontWeight: '700' },
  prev: { minWidth: 0 },
  holdBtn: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkHit: { width: CHECK_COL, height: 44, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  activeRow: {
    minHeight: 96,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  leadIn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  leadInText: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: COLORS.accent, fontVariant: ['tabular-nums'], flex: 1 },
  stopBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: RADII.md,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBanner: { marginBottom: SPACING.xs },
  romRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingLeft: SET_COL + SPACING.lg, paddingTop: SPACING.xs },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.sm, paddingTop: SPACING.xs },
});
