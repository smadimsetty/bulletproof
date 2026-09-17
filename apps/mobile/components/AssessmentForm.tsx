// apps/mobile/components/AssessmentForm.tsx
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { SPACING, sharedStyles, TYPE } from '../lib/theme';
import { isAssessmentComplete, type AssessmentDefinition, type AssessmentResultInput } from '../lib/sprintAssessment';

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

  function updateField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', text: string) {
    const parsed = text.trim() === '' ? undefined : Number(text);
    setDraft((prev) => {
      const next = new Map(prev);
      const existing = next.get(testKey) ?? { testKey };
      next.set(testKey, { ...existing, [field]: Number.isNaN(parsed as number) ? undefined : parsed });
      return next;
    });
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
});
