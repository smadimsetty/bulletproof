// apps/mobile/components/routines/FolderSheet.tsx
//
// Small modal with two modes: name a folder (create / rename) or pick the
// folder to move a routine into (null = Unfiled).
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, TYPE, sharedStyles } from '../../lib/theme';
import type { RoutineFolder } from '../../lib/routines';

export type FolderSheetMode =
  | { kind: 'name'; title: string; initial: string; onSubmit: (name: string) => void }
  | { kind: 'pick'; folders: readonly RoutineFolder[]; current: string | null; onPick: (folderId: string | null) => void };

export default function FolderSheet({ mode, onClose }: { mode: FolderSheetMode | null; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (mode?.kind === 'name') setName(mode.initial);
  }, [mode]);

  return (
    <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so the backdrop doesn't close the sheet. */}
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {mode?.kind === 'name' ? (
            <>
              <Text style={TYPE.sectionTitle}>{mode.title}</Text>
              <TextInput
                style={sharedStyles.textInput}
                value={name}
                onChangeText={setName}
                maxLength={60}
                autoFocus
                placeholder="Folder name"
                placeholderTextColor={COLORS.muted}
              />
              <Pressable
                style={[sharedStyles.primaryButton, name.trim() === '' && styles.disabled]}
                disabled={name.trim() === ''}
                onPress={() => {
                  mode.onSubmit(name.trim());
                  onClose();
                }}
              >
                <Text style={sharedStyles.primaryButtonText}>Save</Text>
              </Pressable>
            </>
          ) : mode?.kind === 'pick' ? (
            <>
              <Text style={TYPE.sectionTitle}>Move to folder</Text>
              {[{ id: null as string | null, name: 'Unfiled' }, ...mode.folders].map((f) => (
                <Pressable
                  key={f.id ?? 'unfiled'}
                  style={styles.option}
                  onPress={() => {
                    mode.onPick(f.id);
                    onClose();
                  }}
                >
                  <Text style={[TYPE.body, f.id === mode.current && styles.current]}>{f.name}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: SPACING.lg },
  sheet: { backgroundColor: COLORS.card, borderRadius: 16, padding: SPACING.md, gap: SPACING.sm },
  option: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  current: { color: COLORS.accent, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
