import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import type { FinishInput } from '../../lib/workouts';

export interface FinishSheetProps {
  visible: boolean;
  initialTitle: string;
  isSprint: boolean;
  saving: boolean;
  onSave: (input: FinishInput) => void;
  onDiscard: () => void;
  onClose: () => void;
}

type Reaction = FinishInput['reaction'];

const REACTIONS: { value: Exclude<Reaction, null>; label: string }[] = [
  { value: 'good', label: 'Felt good' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'hurt', label: 'That hurt' },
];

export default function FinishSheet({ visible, initialTitle, isSprint, saving, onSave, onDiscard, onClose }: FinishSheetProps) {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [reaction, setReaction] = useState<Reaction>(null);
  const [reactionNote, setReactionNote] = useState('');

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setNotes('');
      setReaction(null);
      setReactionNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={TYPE.screenTitle}>Finish workout</Text>
        <TextInput
          style={sharedStyles.textInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={COLORS.muted}
        />
        <TextInput
          style={[sharedStyles.textInput, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          placeholderTextColor={COLORS.muted}
          multiline
        />
        {isSprint && (
          <View style={styles.reactionBlock}>
            <Text style={TYPE.sectionTitle}>How did that feel?</Text>
            <View style={styles.chipRow}>
              {REACTIONS.map((r) => {
                const active = reaction === r.value;
                return (
                  <Pressable
                    key={r.value}
                    style={[sharedStyles.chip, active && styles.chipActive]}
                    onPress={() => setReaction(active ? null : r.value)}
                  >
                    <Text style={[sharedStyles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={sharedStyles.textInput}
              value={reactionNote}
              onChangeText={setReactionNote}
              placeholder="Anything to note? (optional)"
              placeholderTextColor={COLORS.muted}
            />
          </View>
        )}
        <Pressable
          style={[sharedStyles.primaryButton, saving && styles.disabled]}
          disabled={saving}
          onPress={() => onSave({ title, notes, reaction, reactionNote })}
        >
          <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save workout'}</Text>
        </Pressable>
        <Pressable onPress={onDiscard} style={styles.textBtn}>
          <Text style={[TYPE.label, { color: COLORS.danger }]}>Discard workout</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.textBtn}>
          <Text style={[TYPE.label, { color: COLORS.accent }]}>Keep logging</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  reactionBlock: { gap: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chipActive: { backgroundColor: COLORS.accent },
  chipTextActive: { color: COLORS.card },
  disabled: { opacity: 0.6 },
  textBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
});
