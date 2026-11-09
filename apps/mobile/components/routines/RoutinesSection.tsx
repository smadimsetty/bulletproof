// apps/mobile/components/routines/RoutinesSection.tsx
//
// The Routines block of the Workout tab: folders (collapsible, Unfiled last),
// routine cards with a Start button, and long-press action menus.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE, sharedStyles } from '../../lib/theme';
import { createFolder, deleteFolder, deleteRoutine, moveRoutine, renameFolder, type Routine, type RoutineFolder } from '../../lib/routines';
import FolderSheet, { type FolderSheetMode } from './FolderSheet';

export interface RoutinesSectionProps {
  folders: readonly RoutineFolder[];
  routines: readonly Routine[];
  starting: boolean;
  onStart: (routine: Routine) => void;
  /** Called after any change so the parent refetches. */
  onChanged: () => void;
}

function exerciseSummary(r: Routine): string {
  if (r.exercises.length === 0) return 'No exercises';
  const names = r.exercises.slice(0, 3).map((e) => e.exerciseName);
  const more = r.exercises.length - names.length;
  return names.join(', ') + (more > 0 ? ` +${more}` : '');
}

export default function RoutinesSection({ folders, routines, starting, onStart, onChanged }: RoutinesSectionProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<FolderSheetMode | null>(null);

  async function guarded(action: () => Promise<unknown>, fallback: string) {
    try {
      await action();
      onChanged();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? fallback);
    }
  }

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function routineMenu(r: Routine) {
    Alert.alert(r.title, undefined, [
      { text: 'Edit', onPress: () => router.push(`/routines/${r.id}`) },
      {
        text: 'Move to folder',
        onPress: () =>
          setSheet({
            kind: 'pick',
            folders,
            current: r.folderId,
            onPick: (folderId) => void guarded(() => moveRoutine(r.id, folderId), 'Could not move that routine.'),
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete routine?', `"${r.title}" will be removed. Past workouts are kept.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void guarded(() => deleteRoutine(r.id), 'Could not delete that routine.') },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function folderMenu(f: RoutineFolder) {
    Alert.alert(f.name, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          setSheet({
            kind: 'name',
            title: 'Rename folder',
            initial: f.name,
            onSubmit: (name) => void guarded(() => renameFolder(f.id, name), 'Could not rename that folder.'),
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete folder?', 'Routines inside move to Unfiled.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void guarded(() => deleteFolder(f.id), 'Could not delete that folder.') },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function renderRoutine(r: Routine) {
    return (
      <Pressable key={r.id} style={sharedStyles.card} onPress={() => router.push(`/routines/${r.id}`)} onLongPress={() => routineMenu(r)}>
        <View style={styles.cardRow}>
          <View style={styles.cardText}>
            <Text style={TYPE.sectionTitle}>{r.title}</Text>
            <Text style={sharedStyles.helperText} numberOfLines={2}>{exerciseSummary(r)}</Text>
          </View>
          <Pressable
            style={[sharedStyles.primaryButton, (starting || r.exercises.length === 0) && styles.disabled]}
            disabled={starting || r.exercises.length === 0}
            onPress={() => onStart(r)}
          >
            <Text style={sharedStyles.primaryButtonText}>Start</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  const unfiled = routines.filter((r) => r.folderId == null || !folders.some((f) => f.id === r.folderId));
  const groups: { key: string; folder: RoutineFolder | null; items: Routine[] }[] = [
    ...folders.map((f) => ({ key: f.id, folder: f, items: routines.filter((r) => r.folderId === f.id) })),
    // Unfiled last; hidden entirely when empty and there are folders to show.
    ...(unfiled.length > 0 || folders.length === 0 ? [{ key: 'unfiled', folder: null, items: unfiled }] : []),
  ];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={TYPE.sectionTitle}>Routines</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/routines/new')} hitSlop={8}>
            <Text style={styles.link}>+ Routine</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setSheet({
                kind: 'name',
                title: 'New folder',
                initial: '',
                onSubmit: (name) => void guarded(() => createFolder(name), 'Could not create that folder.'),
              })
            }
            hitSlop={8}
          >
            <Text style={styles.link}>+ Folder</Text>
          </Pressable>
        </View>
      </View>

      {routines.length === 0 && folders.length === 0 ? (
        <Text style={sharedStyles.helperText}>No routines yet. Create one, or save a finished workout as a routine.</Text>
      ) : null}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        // The Unfiled group needs no header when there are no folders at all.
        const showHeader = g.folder !== null || folders.length > 0;
        return (
          <View key={g.key} style={styles.group}>
            {showHeader ? (
              <Pressable style={styles.groupHeader} onPress={() => toggle(g.key)} onLongPress={g.folder ? () => folderMenu(g.folder!) : undefined}>
                <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={COLORS.muted} />
                <Text style={TYPE.label}>{g.folder?.name ?? 'Unfiled'}</Text>
                <Text style={sharedStyles.helperText}>{g.items.length}</Text>
              </Pressable>
            ) : null}
            {!isCollapsed ? g.items.map(renderRoutine) : null}
            {!isCollapsed && g.folder && g.items.length === 0 ? <Text style={sharedStyles.helperText}>Empty folder.</Text> : null}
          </View>
        );
      })}

      <Pressable onPress={() => router.push('/library')} style={styles.libraryLink}>
        <Text style={styles.link}>Exercises</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
      </Pressable>

      <FolderSheet mode={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: SPACING.md },
  group: { gap: SPACING.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardText: { flex: 1, gap: 2 },
  link: { color: COLORS.accent, fontWeight: '600' },
  libraryLink: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  disabled: { opacity: 0.5 },
});
