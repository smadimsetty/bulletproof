// apps/mobile/components/progress/WeeklyGoalSheet.tsx
//
// Stepper (1-14) for the weekly workout goal. Save is async; a failure keeps
// the sheet open with the error rather than silently dropping the change.
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, TYPE, sharedStyles } from '../../lib/theme';

export default function WeeklyGoalSheet({
  visible,
  current,
  onClose,
  onSave,
}: {
  visible: boolean;
  current: number;
  onClose: () => void;
  onSave: (goal: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(current);
      setError(null);
    }
  }, [visible, current]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={TYPE.sectionTitle}>Weekly goal</Text>
        <Text style={sharedStyles.helperText}>Workouts to finish each week (Mon–Sun) to keep your streak.</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepBtn, draft <= 1 && styles.stepDisabled]}
            disabled={draft <= 1}
            onPress={() => setDraft((d) => Math.max(1, d - 1))}
            accessibilityLabel="Decrease goal"
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.value}>{draft}</Text>
          <Pressable
            style={[styles.stepBtn, draft >= 14 && styles.stepDisabled]}
            disabled={draft >= 14}
            onPress={() => setDraft((d) => Math.min(14, d + 1))}
            accessibilityLabel="Increase goal"
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        {error && <Text style={sharedStyles.warningText}>{error}</Text>}
        <Pressable style={sharedStyles.primaryButton} disabled={saving} onPress={save}>
          <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: COLORS.card,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.4 },
  stepText: { fontSize: 24, color: COLORS.accent, fontWeight: '600' },
  value: { fontSize: 36, fontWeight: '700', color: COLORS.ink, minWidth: 56, textAlign: 'center' },
});
