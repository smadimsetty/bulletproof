// apps/mobile/components/routines/FolderSheet.tsx
//
// Bottom sheet with two modes: name a folder (create / rename) or pick the
// folder for a routine (null = Unfiled). Pick mode can offer an inline
// "+ New folder" field (visual spec 4.14) when the caller passes onCreate.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import type { RoutineFolder } from '../../lib/routines';
import { Button, ListRow, PressableScale, Sheet, TextField } from '../ui';

export type FolderSheetMode =
  | { kind: 'name'; title: string; initial: string; onSubmit: (name: string) => void }
  | {
      kind: 'pick';
      folders: readonly RoutineFolder[];
      current: string | null;
      onPick: (folderId: string | null) => void;
      /** When set, the sheet shows an inline "+ New folder" field that calls this with the name. */
      onCreate?: (name: string) => void | Promise<void>;
    };

export default function FolderSheet({ mode, onClose }: { mode: FolderSheetMode | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Keep the last mode while the sheet animates out.
  const [shown, setShown] = useState<FolderSheetMode | null>(mode);
  useEffect(() => {
    if (mode) setShown(mode);
    if (mode?.kind === 'name') setName(mode.initial);
    if (mode) {
      setCreating(false);
      setNewName('');
    }
  }, [mode]);

  const m = mode ?? shown;
  const submit = () => {
    if (m?.kind !== 'name' || name.trim() === '') return;
    m.onSubmit(name.trim());
    onClose();
  };

  async function submitNew() {
    if (m?.kind !== 'pick' || !m.onCreate || newName.trim() === '' || busy) return;
    setBusy(true);
    try {
      await m.onCreate(newName.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={mode !== null}
      onClose={onClose}
      title={m?.kind === 'name' ? m.title : m?.kind === 'pick' && m.onCreate ? 'Folder' : 'Move to folder'}
      footer={m?.kind === 'name' ? <Button title="Save" size="lg" fullWidth disabled={name.trim() === ''} onPress={submit} /> : undefined}
    >
      {m?.kind === 'name' ? (
        <TextField value={name} onChangeText={setName} maxLength={60} autoFocus placeholder="Folder name" returnKeyType="done" onSubmitEditing={submit} />
      ) : m?.kind === 'pick' ? (
        <>
          {[{ id: null as string | null, name: 'Unfiled' }, ...m.folders].map((f) => (
            <ListRow
              key={f.id ?? 'unfiled'}
              title={f.name}
              leading={{ icon: 'folder-outline', tone: f.id === m.current ? 'accent' : 'neutral' }}
              trailing={f.id === m.current ? <Ionicons name="checkmark" size={18} color={COLORS.accent} /> : undefined}
              onPress={() => {
                m.onPick(f.id);
                onClose();
              }}
            />
          ))}
          {m.onCreate ? (
            creating ? (
              <View style={styles.newRow}>
                <View style={styles.newField}>
                  <TextField
                    value={newName}
                    onChangeText={setNewName}
                    maxLength={60}
                    autoFocus
                    placeholder="Folder name"
                    returnKeyType="done"
                    onSubmitEditing={submitNew}
                  />
                </View>
                <Button title="Add" disabled={newName.trim() === ''} loading={busy} onPress={submitNew} />
              </View>
            ) : (
              <PressableScale style={styles.newButton} scaleTo={0.98} onPress={() => setCreating(true)} accessibilityLabel="New folder">
                <Ionicons name="add" size={20} color={COLORS.accent} />
                <Text style={[TYPE.bodyStrong, { color: COLORS.accent }]}>New folder</Text>
              </PressableScale>
            )
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  newButton: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 56, paddingHorizontal: SPACING.lg },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  newField: { flex: 1 },
});
