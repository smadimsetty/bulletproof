// apps/mobile/components/logger/FinishSheet.tsx
//
// Finish sheet (visual spec 4.6): stat tiles, title, notes, visibility,
// photos, and (sprint workouts) effort, pain 0-10 and where it hurt (spec
// 2026-11-12 §4). Same props and the same onSave /
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
import { bodyPartLabel } from '../../lib/bodyParts';
import PainScale from './PainScale';

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
  /** Distinct areas of the sprint day's slots, offered as "Where?" chips when pain is 3+. */
  painAreas?: readonly string[];
}

type Effort = FinishInput['effort'];

const EFFORTS: { value: Exclude<Effort, null>; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'right', label: 'About right' },
  { value: 'hard', label: 'Too hard' },
];

export default function FinishSheet({ visible, initialTitle, isSprint, defaultVisibility, canPublic, saving, onSave, onDiscard, onClose, stats, painAreas = [] }: FinishSheetProps) {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [effort, setEffort] = useState<Effort>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [painArea, setPainArea] = useState<string | null>(null);
  const [reactionNote, setReactionNote] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);
  const [photoUris, setPhotoUris] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setNotes('');
      setEffort(null);
      setPain(null);
      setPainArea(null);
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
            onPress={() =>
              onSave(
                { title, notes, effort, pain, painArea: pain != null && pain >= 3 ? painArea : null, reactionNote, visibility },
                photoUris
              )
            }
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
          <Text style={TYPE.overline}>How hard was that?</Text>
          <View style={styles.chipRow}>
            {EFFORTS.map((e) => (
              <FilterChip
                key={e.value}
                label={e.label}
                selected={effort === e.value}
                onToggle={() => setEffort(effort === e.value ? null : e.value)}
              />
            ))}
          </View>
          <Text style={TYPE.overline}>Any pain?</Text>
          <PainScale value={pain} onChange={setPain} />
          {pain != null && pain >= 3 ? (
            <>
              <Text style={TYPE.overline}>Where?</Text>
              <View style={styles.chipRow}>
                {[...painAreas, 'other'].map((area) => (
                  <FilterChip
                    key={area}
                    label={area === 'other' ? 'Other' : bodyPartLabel(area)}
                    selected={painArea === area}
                    onToggle={() => setPainArea(painArea === area ? null : area)}
                  />
                ))}
              </View>
            </>
          ) : null}
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
