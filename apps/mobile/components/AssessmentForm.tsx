// apps/mobile/components/AssessmentForm.tsx
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { DescriptionToggleButton, useToggle } from './DescriptionToggle';
import { isAssessmentComplete, type AssessmentDefinition, type AssessmentResultInput } from '../lib/sprintAssessment';

// Two seeded definitions (rounded_shoulders' wall_overhead_reach and
// pushup_plus_control) are scored pass/fail, not measured. They still
// store a number so the schema and AssessmentResultInput stay uniform --
// 1 for pass, 0 for fail -- but a numeric keyboard is unanswerable for
// them, which left Submit permanently disabled.
const PASS_FAIL_UNIT = 'pass/fail';
const PASS_FAIL_OPTIONS = [
  { label: 'Pass', value: 1 },
  { label: 'Fail', value: 0 },
] as const;

function formatPrefillDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AssessmentForm({
  title,
  definitions,
  onSubmit,
  submitting,
  initialDraft,
  prefilledFrom,
}: {
  title: string;
  definitions: readonly AssessmentDefinition[];
  onSubmit: (results: AssessmentResultInput[]) => void;
  submitting: boolean;
  /** Seed values (see prefillDraft); the parent re-keys the form when they arrive. */
  initialDraft?: Map<string, AssessmentResultInput>;
  /** ISO date of the assessment the draft was copied from. */
  prefilledFrom?: string | null;
}) {
  const [draft, setDraft] = useState<Map<string, AssessmentResultInput>>(() => new Map(initialDraft ?? []));
  // What the user is literally typing, per field. Without it a controlled
  // input would reformat mid-entry ("9." -> 9) and fight the decimal point.
  const [rawText, setRawText] = useState<Map<string, string>>(new Map());
  const [showBanner, setShowBanner] = useState(() => !!prefilledFrom && (initialDraft?.size ?? 0) > 0);

  function setField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', value: number | undefined) {
    setDraft((prev) => {
      const next = new Map(prev);
      const existing = next.get(testKey) ?? { testKey };
      next.set(testKey, { ...existing, [field]: value });
      return next;
    });
  }

  function updateField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', text: string) {
    setRawText((prev) => new Map(prev).set(`${testKey}:${field}`, text));
    const parsed = text.trim() === '' ? undefined : Number(text);
    setField(testKey, field, Number.isNaN(parsed as number) ? undefined : parsed);
  }

  function clearAll() {
    setDraft(new Map());
    setRawText(new Map());
    setShowBanner(false);
  }

  const complete = isAssessmentComplete(definitions, draft);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>{title}</Text>
      {showBanner && prefilledFrom && (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.helperText}>
            Prefilled from your {formatPrefillDate(prefilledFrom)} assessment — change anything that's different.
          </Text>
          <Pressable onPress={clearAll} hitSlop={8}>
            <Text style={styles.clearLink}>Clear all</Text>
          </Pressable>
        </View>
      )}
      {definitions.map((def) => (
        <AssessmentCard
          key={def.testKey}
          def={def}
          draft={draft}
          rawText={rawText}
          setField={setField}
          updateField={updateField}
        />
      ))}
      <Pressable
        style={sharedStyles.primaryButton}
        disabled={!complete || submitting}
        onPress={() => onSubmit(Array.from(draft.values()))}
      >
        <Text style={sharedStyles.primaryButtonText}>{submitting ? 'Saving…' : 'Submit'}</Text>
      </Pressable>
    </ScrollView>
  );
}

type Field = 'valueLeft' | 'valueRight' | 'valueSingle';

// Own component so each card keeps its own open/closed state.
function AssessmentCard({
  def,
  draft,
  rawText,
  setField,
  updateField,
}: {
  def: AssessmentDefinition;
  draft: Map<string, AssessmentResultInput>;
  rawText: Map<string, string>;
  setField: (testKey: string, field: Field, value: number | undefined) => void;
  updateField: (testKey: string, field: Field, text: string) => void;
}) {
  const [open, toggle] = useToggle();
  const hasDescription = !!def.instructions || !!def.targetDescription;
  // Typed text wins; otherwise show the (possibly prefilled) draft value.
  const shown = (field: Field): string => {
    const raw = rawText.get(`${def.testKey}:${field}`);
    if (raw !== undefined) return raw;
    const v = draft.get(def.testKey)?.[field];
    return v == null ? '' : String(v);
  };
  return (
      <View style={sharedStyles.card}>
        <View style={styles.titleRow}>
          <Text style={[sharedStyles.sectionTitle, styles.titleText]}>{def.name}</Text>
          {hasDescription && <DescriptionToggleButton open={open} onToggle={toggle} />}
        </View>
        {open && !!def.instructions && <Text style={sharedStyles.helperText}>{def.instructions}</Text>}
        {open && !!def.targetDescription && <Text style={sharedStyles.helperText}>{def.targetDescription}</Text>}
        {def.isSynthesized && (
          <Text style={sharedStyles.warningText}>
            Not from the Mobility Bible — a standard PT screening test added to cover this gap.
          </Text>
        )}
        {def.isBilateral ? (
          <View style={styles.row}>
            <TextInput
              style={[sharedStyles.textInput, styles.numberInput]}
              keyboardType="numeric"
              placeholder={`Left (${def.unit})`}
              value={shown('valueLeft')}
              onChangeText={(t) => updateField(def.testKey, 'valueLeft', t)}
            />
            <TextInput
              style={[sharedStyles.textInput, styles.numberInput]}
              keyboardType="numeric"
              placeholder={`Right (${def.unit})`}
              value={shown('valueRight')}
              onChangeText={(t) => updateField(def.testKey, 'valueRight', t)}
            />
          </View>
        ) : def.unit === PASS_FAIL_UNIT ? (
          <View style={styles.row}>
            {PASS_FAIL_OPTIONS.map((option) => {
              const selected = draft.get(def.testKey)?.valueSingle === option.value;
              return (
                <Pressable
                  key={option.label}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  onPress={() => setField(def.testKey, 'valueSingle', option.value)}
                >
                  <Text style={[TYPE.body, selected && styles.choiceTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={sharedStyles.textInput}
            keyboardType="numeric"
            placeholder={def.unit}
            value={shown('valueSingle')}
            onChangeText={(t) => updateField(def.testKey, 'valueSingle', t)}
          />
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  titleText: { flex: 1 },
  clearLink: { color: COLORS.accent, fontWeight: '600' },
  row: { flexDirection: 'row', gap: SPACING.sm },
  numberInput: { flex: 1 },
  choice: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  choiceSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  choiceTextSelected: { color: COLORS.card, fontWeight: '600' },
});
