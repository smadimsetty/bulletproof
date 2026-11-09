// apps/mobile/components/routines/FolderSheet.tsx
//
// Bottom sheet with two modes: name a folder (create / rename) or pick the
// folder to move a routine into (null = Unfiled).
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';
import type { RoutineFolder } from '../../lib/routines';
import { Button, ListRow, Sheet, TextField } from '../ui';

export type FolderSheetMode =
  | { kind: 'name'; title: string; initial: string; onSubmit: (name: string) => void }
  | { kind: 'pick'; folders: readonly RoutineFolder[]; current: string | null; onPick: (folderId: string | null) => void };

export default function FolderSheet({ mode, onClose }: { mode: FolderSheetMode | null; onClose: () => void }) {
  const [name, setName] = useState('');
  // Keep the last mode while the sheet animates out.
  const [shown, setShown] = useState<FolderSheetMode | null>(mode);
  useEffect(() => {
    if (mode) setShown(mode);
    if (mode?.kind === 'name') setName(mode.initial);
  }, [mode]);

  const m = mode ?? shown;
  const submit = () => {
    if (m?.kind !== 'name' || name.trim() === '') return;
    m.onSubmit(name.trim());
    onClose();
  };

  return (
    <Sheet
      visible={mode !== null}
      onClose={onClose}
      title={m?.kind === 'name' ? m.title : 'Move to folder'}
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
        </>
      ) : null}
    </Sheet>
  );
}
