// apps/mobile/components/routines/RoutinesSection.tsx
//
// The Routines block of the Workout tab (visual spec 4.3): folders
// (collapsible, Unfiled last), routine cards with a Start button, and
// long-press action sheets.
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { COLORS, MOTION, SPACING, TYPE } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import { createFolder, deleteFolder, deleteRoutine, moveRoutine, renameFolder, type Routine, type RoutineFolder } from '../../lib/routines';
import FolderSheet, { type FolderSheetMode } from './FolderSheet';
import { ActionSheet, Button, Card, ConfirmSheet, EmptyState, IconButton, PressableScale, SectionHeader } from '../ui';

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

function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: reduced ? (open ? '90deg' : '0deg') : withTiming(open ? '90deg' : '0deg', { duration: MOTION.base }) }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
    </Animated.View>
  );
}

// Let the ActionSheet finish dismissing before the next Modal presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 300;
const later = (fn: () => void) => setTimeout(fn, SHEET_HANDOFF_MS);

type Menu = { kind: 'routine'; routine: Routine } | { kind: 'folder'; folder: RoutineFolder } | null;
type Confirm = { kind: 'routine'; routine: Routine } | { kind: 'folder'; folder: RoutineFolder } | null;

export default function RoutinesSection({ folders, routines, starting, onStart, onChanged }: RoutinesSectionProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<FolderSheetMode | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

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

  function openMenu(m: NonNullable<Menu>) {
    haptics.primary();
    setMenu(m);
  }

  function menuActions() {
    if (menu?.kind === 'routine') {
      const r = menu.routine;
      return [
        { label: 'Edit', icon: 'create-outline' as const, onPress: () => router.push(`/routines/${r.id}`) },
        {
          label: 'Move to folder',
          icon: 'folder-outline' as const,
          onPress: () => later(() =>
            setSheet({
              kind: 'pick',
              folders,
              current: r.folderId,
              onPick: (folderId) => void guarded(() => moveRoutine(r.id, folderId), 'Could not move that routine.'),
            })),
        },
        { label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: () => later(() => setConfirm({ kind: 'routine', routine: r })) },
      ];
    }
    if (menu?.kind === 'folder') {
      const f = menu.folder;
      return [
        {
          label: 'Rename',
          icon: 'create-outline' as const,
          onPress: () => later(() =>
            setSheet({
              kind: 'name',
              title: 'Rename folder',
              initial: f.name,
              onSubmit: (name) => void guarded(() => renameFolder(f.id, name), 'Could not rename that folder.'),
            })),
        },
        { label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: () => later(() => setConfirm({ kind: 'folder', folder: f })) },
      ];
    }
    return [];
  }

  function renderRoutine(r: Routine) {
    const disabled = starting || r.exercises.length === 0;
    return (
      <Card key={r.id} padding={14} onPress={() => router.push(`/routines/${r.id}`)}>
        <View style={styles.cardRow}>
          <View style={styles.cardText}>
            <Text style={TYPE.title3} numberOfLines={2}>{r.title}</Text>
            <Text style={TYPE.footnote} numberOfLines={2}>{exerciseSummary(r)}</Text>
          </View>
          <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel={`More options for ${r.title}`} onPress={() => openMenu({ kind: 'routine', routine: r })} />
          <Button title="Start" icon="play" size="sm" disabled={disabled} onPress={() => onStart(r)} />
        </View>
      </Card>
    );
  }

  const unfiled = routines.filter((r) => r.folderId == null || !folders.some((f) => f.id === r.folderId));
  const groups: { key: string; folder: RoutineFolder | null; items: Routine[] }[] = [
    ...folders.map((f) => ({ key: f.id, folder: f, items: routines.filter((r) => r.folderId === f.id) })),
    // Unfiled last; hidden entirely when empty and there are folders to show.
    ...(unfiled.length > 0 || folders.length === 0 ? [{ key: 'unfiled', folder: null, items: unfiled }] : []),
  ];

  const newFolder = () =>
    setSheet({
      kind: 'name',
      title: 'New folder',
      initial: '',
      onSubmit: (name) => void guarded(() => createFolder(name), 'Could not create that folder.'),
    });

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <SectionHeader title="Routines" inset={SPACING.xs} action={{ label: '+ Routine', onPress: () => router.push('/routines/new') }} />
        </View>
        <IconButton icon="folder-open-outline" size="sm" accessibilityLabel="New folder" onPress={newFolder} style={styles.folderButton} />
      </View>

      {routines.length === 0 && folders.length === 0 ? (
        <EmptyState
          compact
          icon="albums-outline"
          title="No routines yet"
          body="Save a workout as a routine, or build one from scratch."
          action={{ label: 'Create routine', onPress: () => router.push('/routines/new') }}
        />
      ) : null}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        // The Unfiled group needs no header when there are no folders at all.
        const showHeader = g.folder !== null || folders.length > 0;
        return (
          <Animated.View key={g.key} layout={LinearTransition.duration(MOTION.base)} style={styles.group}>
            {showHeader ? (
              <PressableScale
                style={styles.groupHeader}
                haptic="select"
                scaleTo={0.98}
                onPress={() => toggle(g.key)}
                onLongPress={g.folder ? () => openMenu({ kind: 'folder', folder: g.folder! }) : undefined}
                accessibilityLabel={`${g.folder?.name ?? 'Unfiled'}, ${g.items.length} routines`}
              >
                <Chevron open={!isCollapsed} />
                <Text style={[TYPE.bodyStrong, styles.groupName]}>{g.folder?.name ?? 'Unfiled'}</Text>
                <Text style={TYPE.caption}>{g.items.length}</Text>
                {g.folder ? (
                  <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel={`More options for ${g.folder.name}`} onPress={() => openMenu({ kind: 'folder', folder: g.folder! })} />
                ) : null}
              </PressableScale>
            ) : null}
            {!isCollapsed ? g.items.map(renderRoutine) : null}
            {!isCollapsed && g.folder && g.items.length === 0 ? <Text style={TYPE.footnote}>Empty folder.</Text> : null}
          </Animated.View>
        );
      })}

      <FolderSheet mode={sheet} onClose={() => setSheet(null)} />
      <ActionSheet
        visible={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.kind === 'routine' ? menu.routine.title : menu?.kind === 'folder' ? menu.folder.name : undefined}
        actions={menuActions()}
      />
      <ConfirmSheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'folder' ? 'Delete folder?' : 'Delete routine?'}
        body={
          confirm?.kind === 'folder'
            ? 'Routines inside move to Unfiled.'
            : confirm?.kind === 'routine'
              ? `"${confirm.routine.title}" will be removed. Past workouts are kept.`
              : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === 'routine') void guarded(() => deleteRoutine(c.routine.id), 'Could not delete that routine.');
          else if (c?.kind === 'folder') void guarded(() => deleteFolder(c.folder.id), 'Could not delete that folder.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 1 },
  folderButton: { marginTop: SPACING.xl - SPACING.sm },
  group: { gap: SPACING.md },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44 },
  groupName: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardText: { flex: 1, gap: 2 },
});
