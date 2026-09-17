// apps/mobile/components/DayFeedbackSheet.tsx
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles } from '../lib/theme';

const REACTIONS: ReadonlyArray<{ id: 'good' | 'neutral' | 'hurt'; label: string }> = [
  { id: 'good', label: 'Felt good' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'hurt', label: 'That hurt' },
];

export default function DayFeedbackSheet({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (reaction: 'good' | 'neutral' | 'hurt', note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={sharedStyles.sectionTitle}>How did that feel?</Text>
          {REACTIONS.map((r) => (
            <Pressable key={r.id} style={sharedStyles.primaryButton} onPress={() => onSubmit(r.id, note)}>
              <Text style={sharedStyles.primaryButtonText}>{r.label}</Text>
            </Pressable>
          ))}
          <TextInput
            style={sharedStyles.textInput}
            placeholder="Anything worth noting? (optional)"
            value={note}
            onChangeText={setNote}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
});
