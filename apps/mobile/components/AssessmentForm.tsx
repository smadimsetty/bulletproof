// apps/mobile/components/AssessmentForm.tsx
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../lib/theme';
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

export default function AssessmentForm({
  title,
  definitions,
  onSubmit,
  submitting,
}: {
  title: string;
  definitions: readonly AssessmentDefinition[];
  onSubmit: (results: AssessmentResultInput[]) => void;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<Map<string, AssessmentResultInput>>(new Map());

  function setField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', value: number | undefined) {
    setDraft((prev) => {
      const next = new Map(prev);
      const existing = next.get(testKey) ?? { testKey };
      next.set(testKey, { ...existing, [field]: value });
      return next;
    });
  }

  function updateField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', text: string) {
    const parsed = text.trim() === '' ? undefined : Number(text);
    setField(testKey, field, Number.isNaN(parsed as number) ? undefined : parsed);
  }

  const complete = isAssessmentComplete(definitions, draft);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>{title}</Text>
      {definitions.map((def) => (
        <View key={def.testKey} style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>{def.name}</Text>
          <Text style={sharedStyles.helperText}>{def.instructions}</Text>
          <Text style={sharedStyles.helperText}>{def.targetDescription}</Text>
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
                onChangeText={(t) => updateField(def.testKey, 'valueLeft', t)}
              />
              <TextInput
                style={[sharedStyles.textInput, styles.numberInput]}
                keyboardType="numeric"
                placeholder={`Right (${def.unit})`}
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
              onChangeText={(t) => updateField(def.testKey, 'valueSingle', t)}
            />
          )}
        </View>
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

const styles = StyleSheet.create({
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
