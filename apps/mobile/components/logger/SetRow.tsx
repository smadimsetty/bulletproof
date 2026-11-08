// One logged-set row. Inputs hold local text while typing (so "4." or an
// empty field never fights the user) and are re-seeded from the draft prop
// whenever the field is not focused.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import type { WorkoutSetRow } from '../../lib/workouts';
import type { RomUnit, SetKind, SetValues } from '../../lib/setFields';
import { displayUnitToKg, formatWeightForDisplay, type WeightUnit } from '../../lib/units';

export interface SetRowProps {
  set: WorkoutSetRow;
  kind: SetKind;
  measureRom: boolean;
  unit: WeightUnit;
  draft: SetValues;
  onChange: (next: SetValues) => void;
  onCommitEdit: () => void;
  onToggleComplete: () => void;
  onToggleWarmup: () => void;
  onDelete: () => void;
  timerLabel: string | null;
  onStartHold: (() => void) | null;
  onStopHold: (() => void) | null;
  hint: string | null;
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

interface NumFieldProps {
  display: string;
  onText: (text: string) => void;
  onCommit: () => void;
  keyboardType: 'decimal-pad' | 'number-pad';
  placeholder?: string;
  width?: number;
}

function NumField({ display, onText, onCommit, keyboardType, placeholder, width = 56 }: NumFieldProps) {
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText((prev) => (sameNumber(prev, display) ? prev : display));
  }, [display, focused]);
  return (
    <TextInput
      style={[sharedStyles.textInput, styles.input, { width }]}
      value={text}
      placeholder={placeholder}
      placeholderTextColor={COLORS.muted}
      keyboardType={keyboardType}
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

export default function SetRow(props: SetRowProps) {
  const { set, kind, measureRom, unit, draft, onChange, onCommitEdit, timerLabel, onStartHold, onStopHold, hint } = props;
  const completed = !!set.completedAt;
  const label = `${set.setType === 'warmup' ? 'W' : String(set.setNumber)}${set.side === 'left' ? 'L' : set.side === 'right' ? 'R' : ''}`;
  const romUnit: RomUnit = draft.romUnit ?? 'cm';

  const duration = draft.durationS;
  const minutes = duration == null ? '' : String(Math.floor(duration / 60));
  const seconds = duration == null ? '' : String(duration % 60);
  const combine = (mText: string, sText: string) => {
    if (mText.trim() === '' && sText.trim() === '') return null;
    return (parseNumber(mText, true) ?? 0) * 60 + (parseNumber(sText, true) ?? 0);
  };

  return (
    <View>
      <View style={[styles.row, completed && styles.rowDone]}>
        <Pressable onLongPress={props.onToggleWarmup} hitSlop={6} style={styles.labelBox}>
          <Text style={styles.label}>{label}</Text>
        </Pressable>

        {kind === 'weight_reps' && (
          <>
            <NumField
              display={formatWeightForDisplay(draft.weightKg, unit)}
              keyboardType="decimal-pad"
              placeholder="wt"
              width={64}
              onText={(t) => {
                const n = parseNumber(t, false);
                onChange({ ...draft, weightKg: n == null ? null : displayUnitToKg(n, unit) });
              }}
              onCommit={onCommitEdit}
            />
            <Text style={styles.unit}>{unit}</Text>
            <Text style={styles.unit}>×</Text>
            <NumField
              display={draft.reps == null ? '' : String(draft.reps)}
              keyboardType="number-pad"
              placeholder="reps"
              onText={(t) => onChange({ ...draft, reps: parseNumber(t, true) })}
              onCommit={onCommitEdit}
            />
          </>
        )}

        {kind === 'reps' && (
          <NumField
            display={draft.reps == null ? '' : String(draft.reps)}
            keyboardType="number-pad"
            placeholder="reps"
            onText={(t) => onChange({ ...draft, reps: parseNumber(t, true) })}
            onCommit={onCommitEdit}
          />
        )}

        {kind === 'hold' && (
          <>
            {timerLabel != null ? (
              <Text style={styles.timer}>{timerLabel}</Text>
            ) : (
              <>
                <NumField
                  display={duration == null ? '' : String(duration)}
                  keyboardType="number-pad"
                  placeholder="sec"
                  onText={(t) => onChange({ ...draft, durationS: parseNumber(t, true) })}
                  onCommit={onCommitEdit}
                />
                <Text style={styles.unit}>s</Text>
              </>
            )}
            {onStopHold ? (
              <Pressable style={styles.holdBtn} onPress={onStopHold} hitSlop={6}>
                <Text style={styles.holdBtnText}>■</Text>
              </Pressable>
            ) : onStartHold ? (
              <Pressable style={styles.holdBtn} onPress={onStartHold} hitSlop={6}>
                <Text style={styles.holdBtnText}>▶</Text>
              </Pressable>
            ) : null}
          </>
        )}

        {kind === 'duration' && (
          <>
            <NumField
              display={minutes}
              keyboardType="number-pad"
              placeholder="mm"
              width={48}
              onText={(t) => onChange({ ...draft, durationS: combine(t, seconds) })}
              onCommit={onCommitEdit}
            />
            <Text style={styles.unit}>:</Text>
            <NumField
              display={seconds}
              keyboardType="number-pad"
              placeholder="ss"
              width={48}
              onText={(t) => onChange({ ...draft, durationS: combine(minutes, t) })}
              onCommit={onCommitEdit}
            />
          </>
        )}

        {measureRom && (
          <>
            <NumField
              display={draft.romValue == null ? '' : String(draft.romValue)}
              keyboardType="decimal-pad"
              placeholder="ROM"
              width={52}
              onText={(t) => onChange({ ...draft, romValue: parseNumber(t, false), romUnit })}
              onCommit={onCommitEdit}
            />
            <Pressable hitSlop={6} onPress={() => onChange({ ...draft, romUnit: ROM_CYCLE[romUnit] })}>
              <Text style={styles.romUnit}>{romUnit}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.spacer} />
        <Pressable
          onPress={props.onToggleComplete}
          hitSlop={6}
          style={[styles.check, completed && styles.checkDone]}
          accessibilityLabel={completed ? 'Mark set incomplete' : 'Mark set complete'}
        >
          <Text style={[styles.checkText, completed && styles.checkTextDone]}>✓</Text>
        </Pressable>
        <Pressable onPress={props.onDelete} hitSlop={8} accessibilityLabel="Delete set">
          <Text style={styles.delete}>×</Text>
        </Pressable>
      </View>
      {hint ? <Text style={[sharedStyles.warningText, styles.hint]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADII.button,
  },
  rowDone: { backgroundColor: COLORS.accentMuted },
  labelBox: { minWidth: 28, alignItems: 'center' },
  label: { ...TYPE.label, fontWeight: '700' },
  input: { textAlign: 'center', paddingVertical: 6, paddingHorizontal: 4, backgroundColor: COLORS.card },
  unit: { ...TYPE.helper },
  timer: { fontSize: 22, fontWeight: '700', color: COLORS.accent, minWidth: 110 },
  holdBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  holdBtnText: { color: COLORS.accent, fontSize: 14 },
  romUnit: { ...TYPE.label, color: COLORS.accent, paddingHorizontal: 4 },
  spacer: { flex: 1 },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: COLORS.accent },
  checkText: { color: COLORS.accent, fontSize: 16, fontWeight: '700' },
  checkTextDone: { color: COLORS.card },
  delete: { fontSize: 20, color: COLORS.muted, paddingHorizontal: 4 },
  hint: { paddingHorizontal: SPACING.sm },
});
