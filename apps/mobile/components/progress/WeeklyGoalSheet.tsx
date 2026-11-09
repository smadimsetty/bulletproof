// apps/mobile/components/progress/WeeklyGoalSheet.tsx
//
// Stepper (1-14) for the weekly workout goal (visual spec 4.9). Save is async;
// a failure keeps the sheet open with the error rather than silently dropping the change.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { Button, Sheet, Stepper } from '../ui';

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
      haptics.success();
      onClose();
    } catch (err: any) {
      haptics.error();
      setError(err?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Weekly goal"
      dismissable={!saving}
      footer={<Button title="Save" size="lg" fullWidth loading={saving} onPress={save} />}
    >
      <View style={styles.body}>
        <Stepper value={draft} min={1} max={14} onChange={setDraft} />
        <Text style={[TYPE.footnote, styles.helper]}>Finish this many workouts Mon–Sun to keep the streak.</Text>
        {error ? <Text style={[TYPE.footnote, { color: COLORS.danger }]}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.lg },
  helper: { textAlign: 'center' },
});
