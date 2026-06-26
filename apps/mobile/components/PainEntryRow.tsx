// apps/mobile/components/PainEntryRow.tsx
//
// One added pain's expanded editor: a stepped row of 10 tappable severity
// buttons (1-10) plus a free-text note field and a remove action. Always
// rendered expanded, not collapsed-then-expand-on-tap -- there are at
// most ~12 possible pains, never enough to need a collapse-by-default
// list-density optimization. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decisions 5 and 10.
//
// The note field commits on blur via local draft state, not on every
// keystroke -- it used to call onChange() directly from onChangeText,
// which fired a full profile save (a network round trip) per character.
// Beyond the obvious waste, it made the field genuinely feel broken: the
// TextInput's value is controlled by the parent's profile.pains state,
// which only updates once each round trip resolves, so fast typing could
// visibly stall or drop characters while a previous keystroke's request
// was still in flight. Every other free-text field in Settings (Diet,
// Weight, Birth date, Location) already uses this same draft-then-blur
// pattern; this brings the pain note field in line with that convention
// instead of being the one outlier.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING, sharedStyles } from '../lib/theme';

export interface PainEntry {
  body_part: string;
  severity: number;
  note: string;
  since: string | null;
}

export interface PainEntryRowProps {
  readonly label: string;
  readonly entry: PainEntry;
  readonly onChange: (next: PainEntry) => void;
  readonly onRemove: () => void;
}

const SEVERITY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function PainEntryRow({ label, entry, onChange, onRemove }: PainEntryRowProps) {
  const [noteDraft, setNoteDraft] = useState(entry.note);

  useEffect(() => {
    setNoteDraft(entry.note);
  }, [entry.note]);

  function handleNoteBlur() {
    if (noteDraft !== entry.note) {
      onChange({ ...entry, note: noteDraft });
    }
  }

  return (
    <View style={[sharedStyles.card, styles.container]}>
      <View style={styles.headerRow}>
        <Text style={sharedStyles.sectionTitle}>{label}</Text>
        <Pressable onPress={onRemove} accessibilityLabel={`Remove ${label}`}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <Text style={sharedStyles.helperText}>Severity</Text>
      <View style={styles.severityRow}>
        {SEVERITY_LEVELS.map((level) => {
          const active = entry.severity === level;
          return (
            <Pressable
              key={level}
              style={[styles.severityButton, active && styles.severityButtonActive]}
              onPress={() => onChange({ ...entry, severity: level })}
              accessibilityLabel={`Severity ${level}`}
            >
              <Text style={[styles.severityText, active && styles.severityTextActive]}>
                {level}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={sharedStyles.helperText}>Note</Text>
      <TextInput
        style={[sharedStyles.textInput, styles.noteInput]}
        value={noteDraft}
        onChangeText={setNoteDraft}
        onBlur={handleNoteBlur}
        placeholder="Anything worth remembering about this"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeText: {
    color: COLORS.danger,
    fontWeight: '600',
  },
  severityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  severityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  severityText: {
    color: COLORS.ink,
    fontWeight: '600',
  },
  severityTextActive: {
    color: COLORS.card,
  },
  noteInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
