// apps/mobile/components/social/ReportSheet.tsx
//
// Reason picker (+ optional note) for reporting a workout, comment or user,
// and the useSafety hook that wires report / block into any screen.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from '../../lib/social/reportReasons';
import { block, hideWorkout, report } from '../../lib/social/safety';

function ReportSheet({
  visible,
  label,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  label: string;
  onSubmit: (reason: ReportReason, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
    }
  }, [visible]);

  async function submit() {
    if (!reason || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason, note);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send your report.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
        <Text style={TYPE.screenTitle}>Report {label}</Text>
        <Text style={sharedStyles.helperText}>Why are you reporting this? Reports are reviewed by a moderator.</Text>
        <View style={sharedStyles.card}>
          {REPORT_REASONS.map((r) => (
            <Pressable key={r.value} style={styles.reasonRow} onPress={() => setReason(r.value)} accessibilityRole="radio" accessibilityState={{ selected: reason === r.value }}>
              <Ionicons name={reason === r.value ? 'radio-button-on' : 'radio-button-off'} size={22} color={COLORS.accent} />
              <Text style={TYPE.body}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[sharedStyles.textInput, styles.note]}
          value={note}
          onChangeText={setNote}
          placeholder="Add details (optional)"
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={500}
        />
        {error && <Text style={sharedStyles.warningText}>{error}</Text>}
        <Pressable style={[sharedStyles.primaryButton, (!reason || submitting) && styles.dim]} disabled={!reason || submitting} onPress={submit}>
          <Text style={sharedStyles.primaryButtonText}>{submitting ? 'Sending…' : 'Send report'}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
          <Text style={[TYPE.label, { color: COLORS.accent }]}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** "this workout", "@ana", "this comment" */
  label: string;
  /** Runs after a successful report (e.g. drop the item from the screen). */
  after?: () => void;
}

/** Report + block flows for any screen; render `element` once somewhere in the tree. */
export function useSafety(): {
  openReport: (t: ReportTarget) => void;
  confirmBlock: (user: { id: string; handle: string; displayName: string }, onBlocked?: () => void) => void;
  element: ReactElement;
} {
  const [target, setTarget] = useState<ReportTarget | null>(null);

  const openReport = useCallback((t: ReportTarget) => setTarget(t), []);

  const confirmBlock = useCallback((user: { id: string; handle: string; displayName: string }, onBlocked?: () => void) => {
    Alert.alert(
      `Block @${user.handle}?`,
      "You won't see each other's workouts, comments or profile, and any follows between you are removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await block(user);
              onBlocked?.();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not block this user.');
            }
          },
        },
      ]
    );
  }, []);

  const element = (
    <ReportSheet
      visible={!!target}
      label={target?.label ?? ''}
      onClose={() => setTarget(null)}
      onSubmit={async (reason, note) => {
        const t = target;
        if (!t) return;
        await report(t.type, t.id, reason, note);
        // Reported content disappears for the reporter right away.
        if (t.type === 'workout') await hideWorkout(t.id).catch(() => undefined);
        setTarget(null);
        Alert.alert('Thanks for reporting', "We'll review it. You won't see this again.");
        t.after?.();
      }}
    />
  );

  return { openReport, confirmBlock, element };
}

const styles = StyleSheet.create({
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  note: { minHeight: 80, textAlignVertical: 'top' },
  dim: { opacity: 0.5 },
  cancel: { alignItems: 'center', paddingVertical: SPACING.sm },
});
