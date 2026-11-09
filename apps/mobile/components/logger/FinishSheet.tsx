// apps/mobile/components/logger/FinishSheet.tsx
//
// Finish sheet (visual spec 4.6): stat tiles, title, notes, visibility,
// photos, and (sprint workouts) how it felt. Same props and the same onSave /
// onDiscard / onClose contract as before; presentation only.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING, TYPE } from '../../lib/theme';
import type { FinishInput } from '../../lib/workouts';
import type { Visibility } from '../../lib/userSettings';
import VisibilityPicker from '../social/VisibilityPicker';
import PhotoStrip from '../social/PhotoStrip';
import { MAX_PHOTOS } from '../../lib/social/media';
import { Button, Card, FilterChip, Sheet, Stat, TextField } from '../ui';

export interface FinishSheetStats {
  /** Elapsed time, e.g. "42:10". */
  time: string;
  exercises: number;
  sets: number;
}

export interface FinishSheetProps {
  visible: boolean;
  initialTitle: string;
  isSprint: boolean;
  /** Where the visibility control starts (already resolved for sprint / profile rules). */
  defaultVisibility: Visibility;
  /** Public is selectable only when the user's profile is public. */
  canPublic: boolean;
  saving: boolean;
  onSave: (input: FinishInput, photoUris: string[]) => void;
  onDiscard: () => void;
  onClose: () => void;
  stats?: FinishSheetStats;
}

type Reaction = FinishInput['reaction'];

const REACTIONS: { value: Exclude<Reaction, null>; label: string }[] = [
  { value: 'good', label: 'Felt good' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'hurt', label: 'That hurt' },
];

export default function FinishSheet({ visible, initialTitle, isSprint, defaultVisibility, canPublic, saving, onSave, onDiscard, onClose, stats }: FinishSheetProps) {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [reaction, setReaction] = useState<Reaction>(null);
  const [reactionNote, setReactionNote] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);
  const [photoUris, setPhotoUris] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setNotes('');
      setReaction(null);
      setReactionNote('');
      setVisibility(defaultVisibility);
      setPhotoUris([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Finish workout"
      snap="tall"
      // Not dismissable (drag, scrim or close) while the save is in flight.
      dismissable={!saving}
      footer={
        <>
          <Button
            title="Save workout"
            size="lg"
            fullWidth
            loading={saving}
            onPress={() => onSave({ title, notes, reaction, reactionNote, visibility }, photoUris)}
          />
          <View style={styles.footerRow}>
            <Button title="Discard workout" variant="destructive" size="sm" disabled={saving} onPress={onDiscard} />
            <Button title="Keep logging" variant="ghost" size="sm" disabled={saving} onPress={onClose} />
          </View>
        </>
      }
    >
      {stats ? (
        <View style={styles.tiles}>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Time" value={stats.time} />
          </Card>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Exercises" value={stats.exercises} />
          </Card>
          <Card padding={14} style={styles.tile}>
            <Stat size="md" label="Sets" value={stats.sets} />
          </Card>
        </View>
      ) : null}
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Title" />
      <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Notes or a caption" multiline />
      <View style={styles.block}>
        <Text style={TYPE.overline}>Visibility</Text>
        <VisibilityPicker value={visibility} onChange={setVisibility} canPublic={canPublic} />
        {isSprint ? <Text style={TYPE.footnote}>Sprint workouts default to Private.</Text> : null}
        {visibility === 'private' && !isSprint ? <Text style={TYPE.footnote}>Only you.</Text> : null}
      </View>
      <View style={styles.block}>
        <Text style={TYPE.overline}>Photos</Text>
        <PhotoStrip uris={photoUris} max={MAX_PHOTOS} onChange={setPhotoUris} disabled={saving} />
      </View>
      {isSprint && (
        <View style={styles.block}>
          <Text style={TYPE.overline}>How did that feel?</Text>
          <View style={styles.chipRow}>
            {REACTIONS.map((r) => (
              <FilterChip
                key={r.value}
                label={r.label}
                selected={reaction === r.value}
                onToggle={() => setReaction(reaction === r.value ? null : r.value)}
              />
            ))}
          </View>
          <TextField value={reactionNote} onChangeText={setReactionNote} placeholder="Anything to note? (optional)" />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: SPACING.sm },
  tile: { flex: 1, minHeight: 96, justifyContent: 'center' },
  block: { gap: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
