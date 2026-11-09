// apps/mobile/components/social/ReportSheet.tsx
//
// Reason picker (+ optional note) for reporting a workout, comment or user, and the
// useSafety hook that wires report / block into any screen (visual spec 4.24).
// After a report succeeds the sheet turns into a thank-you with an optional "Also block".
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from '../../lib/social/reportReasons';
import { block, hideWorkout, report } from '../../lib/social/safety';
import { Button, ConfirmSheet, ListRow, Sheet, TextField } from '../ui';

type BlockableUser = { id: string; handle: string; displayName: string };

// Let one Sheet finish dismissing before the next presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 350;

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected ? { borderColor: COLORS.accent } : null]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

function ReportSheet({
  visible,
  label,
  blockUser,
  onSubmit,
  onDone,
  onBlockToo,
}: {
  visible: boolean;
  label: string;
  blockUser?: BlockableUser;
  onSubmit: (reason: ReportReason, note: string) => Promise<void>;
  /** Sheet closed (Done, scrim, drag) -- after a successful report this runs the caller's `after`. */
  onDone: (submitted: boolean) => void;
  onBlockToo: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
      setSubmitted(false);
    }
  }, [visible]);

  async function submit() {
    if (!reason || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason, note);
      haptics.success();
      setSubmitted(true);
    } catch (err: any) {
      haptics.error();
      setError(err?.message ?? 'Could not send your report.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const close = () => onDone(submitted);
  const duplicate = error === 'You already reported this.';

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={submitted ? undefined : 'Report'}
      subtitle={submitted ? undefined : `What's wrong with ${label}?`}
      dismissable={!submitting}
      snap="tall"
      footer={
        submitted ? undefined : (
          <Button
            title="Submit report"
            variant="destructive"
            solid
            size="lg"
            fullWidth
            disabled={!reason}
            loading={submitting}
            onPress={submit}
          />
        )
      }
    >
      {submitted ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.done}>
          <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
          <Text style={[TYPE.title3, styles.center]}>Thanks — we'll review this.</Text>
          {blockUser ? (
            <Button title={`Also block @${blockUser.handle}?`} variant="secondary" size="lg" fullWidth onPress={onBlockToo} />
          ) : null}
          <Button title="Done" size="lg" fullWidth onPress={close} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.form}>
          <View>
            {REPORT_REASONS.map((r) => (
              <ListRow
                key={r.value}
                title={r.label}
                leading={<Radio selected={reason === r.value} />}
                onPress={() => {
                  haptics.select();
                  setReason(r.value);
                }}
                accessibilityLabel={r.label}
              />
            ))}
          </View>
          <TextField
            label="Add details (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            error={error && !duplicate ? error : undefined}
          />
          {duplicate ? <Text style={TYPE.footnote}>You already reported this.</Text> : null}
        </Animated.View>
      )}
    </Sheet>
  );
}

interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** "this workout", "@ana", "this comment" */
  label: string;
  /** Runs after a successful report once the sheet closes (e.g. drop the item from the screen). */
  after?: () => void;
  /** The content's author; enables the "Also block" follow-up. */
  blockUser?: BlockableUser;
}

interface BlockTarget {
  user: BlockableUser;
  /** Runs once the block sheet is dismissed or the block succeeded. */
  then?: () => void;
  /** Also run `then` when the confirm is declined (report flow: the reported item should still go away). */
  thenOnDecline?: boolean;
}

/** Report + block flows for any screen; render `element` once somewhere in the tree. */
export function useSafety(): {
  openReport: (t: ReportTarget) => void;
  confirmBlock: (user: BlockableUser, onBlocked?: () => void) => void;
  element: ReactElement;
} {
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [blocking, setBlocking] = useState(false);
  // Keeps the label/blockUser while the sheet animates out.
  const lastTarget = useRef<ReportTarget | null>(null);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;
  const afterRan = useRef(false);

  const openReport = useCallback((t: ReportTarget) => {
    afterRan.current = false;
    setTarget(t);
  }, []);

  const confirmBlock = useCallback((user: BlockableUser, onBlocked?: () => void) => {
    setBlockTarget({ user, then: onBlocked });
  }, []);

  function finishReport(submitted: boolean) {
    const t = target;
    setTarget(null);
    if (submitted && t && !afterRan.current) {
      afterRan.current = true;
      t.after?.();
    }
  }

  async function doBlock() {
    const b = blockTarget;
    if (!b || blocking) return;
    setBlocking(true);
    try {
      await block(b.user);
      setBlockTarget(null);
      haptics.success();
      b.then?.();
    } catch (err: any) {
      haptics.error();
      setBlockTarget(null);
      Alert.alert('Error', err?.message ?? 'Could not block this user.');
    } finally {
      setBlocking(false);
    }
  }

  const element = (
    <>
      <ReportSheet
        visible={!!target}
        label={shown?.label ?? ''}
        blockUser={shown?.blockUser}
        onDone={finishReport}
        onBlockToo={() => {
          const t = target;
          if (!t?.blockUser) return;
          // Hand off to the block confirm; the caller's `after` runs when that finishes.
          afterRan.current = true;
          setTarget(null);
          setTimeout(() => setBlockTarget({ user: t.blockUser!, then: t.after, thenOnDecline: true }), SHEET_HANDOFF_MS);
        }}
        onSubmit={async (reason, note) => {
          const t = target;
          if (!t) return;
          await report(t.type, t.id, reason, note);
          // Reported content disappears for the reporter right away.
          if (t.type === 'workout') await hideWorkout(t.id).catch(() => undefined);
        }}
      />
      <ConfirmSheet
        visible={!!blockTarget}
        onClose={() => {
          const b = blockTarget;
          setBlockTarget(null);
          // Declined: still let the caller finish what it was doing (e.g. drop the reported item).
          if (b?.then && b.thenOnDecline && !blocking) b.then();
        }}
        title={blockTarget ? `Block @${blockTarget.user.handle}?` : 'Block?'}
        body="You won't see each other's workouts, comments or profiles, and any follows between you are removed. They won't be told."
        confirmLabel="Block"
        destructive
        loading={blocking}
        onConfirm={doBlock}
      />
    </>
  );

  return { openReport, confirmBlock, element };
}

const styles = StyleSheet.create({
  form: { gap: SPACING.md },
  done: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.lg },
  center: { textAlign: 'center' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
});
