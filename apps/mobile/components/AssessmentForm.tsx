// apps/mobile/components/AssessmentForm.tsx
//
// Baseline / reassessment form (visual spec 4.5b). One Card per test, an
// eye toggle for the instructions, large numeric inputs (or Pass/Fail
// buttons), a prefill banner, and a sticky Save footer that stays disabled
// until every test is answered. State handling is unchanged.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../lib/theme';
import { DescriptionBody, DescriptionToggleButton, useToggle } from './DescriptionToggle';
import { isAssessmentComplete, type AssessmentDefinition, type AssessmentResultInput } from '../lib/sprintAssessment';
import { Button, Card, Chip, NumberField, PressableScale, StickyFooter } from './ui';

// Two seeded definitions (rounded_shoulders' wall_overhead_reach and
// pushup_plus_control) are scored pass/fail, not measured. They still
// store a number so the schema and AssessmentResultInput stay uniform --
// 1 for pass, 0 for fail -- but a numeric keyboard is unanswerable for
// them, which left Submit permanently disabled.
const PASS_FAIL_UNIT = 'pass/fail';
const PASS_FAIL_OPTIONS = [
  { label: 'Pass', value: 1, icon: 'checkmark' as const },
  { label: 'Fail', value: 0, icon: 'close' as const },
];

function formatPrefillDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Field = 'valueLeft' | 'valueRight' | 'valueSingle';

function isTestComplete(def: AssessmentDefinition, entry: AssessmentResultInput | undefined): boolean {
  if (!entry) return false;
  return def.isBilateral ? entry.valueLeft !== undefined && entry.valueRight !== undefined : entry.valueSingle !== undefined;
}

export default function AssessmentForm({
  title,
  phase,
  definitions,
  onSubmit,
  submitting,
  initialDraft,
  prefilledFrom,
}: {
  title: string;
  /** Which assessment this is; drives the header chip, hero strip and button label. */
  phase: 'baseline' | 'reassessment';
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

  function setField(testKey: string, field: Field, value: number | undefined) {
    setDraft((prev) => {
      const next = new Map(prev);
      const existing = next.get(testKey) ?? { testKey };
      next.set(testKey, { ...existing, [field]: value });
      return next;
    });
  }

  function updateField(testKey: string, field: Field, text: string) {
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
  const doneCount = definitions.filter((d) => isTestComplete(d, draft.get(d.testKey))).length;
  const left = definitions.length - doneCount;
  const baseline = phase === 'baseline';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        indicatorStyle="white"
      >
        {!baseline ? (
          <Card variant="accent">
            <View style={styles.heroRow}>
              <Text style={styles.heroNumber} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>
                14
              </Text>
              <Text style={TYPE.title3}>days done</Text>
            </View>
            <Text style={TYPE.callout}>Time to see what changed.</Text>
          </Card>
        ) : null}
        <View style={styles.headRow}>
          <Chip label={baseline ? 'Baseline' : 'Reassessment'} tone="accent" />
          <Text style={TYPE.caption}>{`${doneCount}/${definitions.length} done`}</Text>
        </View>
        <Text style={TYPE.title2}>{title}</Text>
        <Text style={TYPE.footnote}>{`Takes ~5 minutes. Be honest — this is your ${baseline ? 'before photo' : 'after photo'}.`}</Text>
        {showBanner && prefilledFrom && (
          <Card style={styles.banner}>
            <View style={styles.bannerRow}>
              <Ionicons name="time-outline" size={20} color={COLORS.warning} />
              <Text style={[TYPE.callout, styles.bannerText]}>
                {`Prefilled from your ${formatPrefillDate(prefilledFrom)} assessment — change anything that is different.`}
              </Text>
            </View>
            <Button title="Clear all" variant="ghost" size="sm" onPress={clearAll} style={styles.alignStart} />
          </Card>
        )}
        {definitions.map((def, i) => (
          <AssessmentCard
            key={def.testKey}
            index={i + 1}
            def={def}
            draft={draft}
            rawText={rawText}
            setField={setField}
            updateField={updateField}
          />
        ))}
      </ScrollView>
      <StickyFooter>
        {!complete ? <Text style={[TYPE.footnote, styles.helper]}>{`${left} ${left === 1 ? 'test' : 'tests'} left`}</Text> : null}
        <Button
          title={baseline ? 'Save baseline' : 'Save reassessment'}
          size="lg"
          fullWidth
          disabled={!complete}
          loading={submitting}
          onPress={() => onSubmit(Array.from(draft.values()))}
        />
      </StickyFooter>
    </View>
  );
}

// Own component so each card keeps its own open/closed state.
function AssessmentCard({
  index,
  def,
  draft,
  rawText,
  setField,
  updateField,
}: {
  index: number;
  def: AssessmentDefinition;
  draft: Map<string, AssessmentResultInput>;
  rawText: Map<string, string>;
  setField: (testKey: string, field: Field, value: number | undefined) => void;
  updateField: (testKey: string, field: Field, text: string) => void;
}) {
  const [open, toggle] = useToggle();
  const hasDescription = !!def.instructions || !!def.targetDescription;
  const done = isTestComplete(def, draft.get(def.testKey));
  // Typed text wins; otherwise show the (possibly prefilled) draft value.
  const shown = (field: Field): string => {
    const raw = rawText.get(`${def.testKey}:${field}`);
    if (raw !== undefined) return raw;
    const v = draft.get(def.testKey)?.[field];
    return v == null ? '' : String(v);
  };
  return (
    <Card>
      <View style={styles.titleRow}>
        <View style={styles.numberCircle}>
          {done ? (
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          ) : (
            <Text style={[TYPE.callout, styles.numberText]}>{index}</Text>
          )}
        </View>
        <Text style={[TYPE.title3, styles.titleText]}>{def.name}</Text>
        {hasDescription && <DescriptionToggleButton open={open} onToggle={toggle} />}
      </View>
      {hasDescription && (
        <DescriptionBody open={open}>
          <View style={styles.descBody}>
            {!!def.instructions && <Text style={[TYPE.callout, styles.desc]}>{def.instructions}</Text>}
            {!!def.targetDescription && <Text style={[TYPE.callout, styles.desc]}>{def.targetDescription}</Text>}
          </View>
        </DescriptionBody>
      )}
      {def.isSynthesized && (
        <Text style={[TYPE.footnote, { color: COLORS.warning }]}>
          Not from the Mobility Bible — a standard PT screening test added to cover this gap.
        </Text>
      )}
      {def.isBilateral ? (
        <View style={styles.row}>
          <View style={styles.side}>
            <Text style={[TYPE.overline, { color: COLORS.chartLeft }]}>Left</Text>
            <NumberField
              size="large"
              decimal
              width={96}
              unit={def.unit}
              value={shown('valueLeft')}
              onChangeText={(t) => updateField(def.testKey, 'valueLeft', t)}
              accessibilityLabel={`${def.name}, left`}
            />
          </View>
          <View style={styles.side}>
            <Text style={[TYPE.overline, { color: COLORS.chartRight }]}>Right</Text>
            <NumberField
              size="large"
              decimal
              width={96}
              unit={def.unit}
              value={shown('valueRight')}
              onChangeText={(t) => updateField(def.testKey, 'valueRight', t)}
              accessibilityLabel={`${def.name}, right`}
            />
          </View>
        </View>
      ) : def.unit === PASS_FAIL_UNIT ? (
        <View style={styles.row}>
          {PASS_FAIL_OPTIONS.map((option) => {
            const selected = draft.get(def.testKey)?.valueSingle === option.value;
            const pass = option.value === 1;
            const tint = pass ? COLORS.successTint : COLORS.dangerTint;
            const tone = pass ? COLORS.success : COLORS.danger;
            return (
              <PressableScale
                key={option.label}
                haptic="select"
                accessibilityLabel={`${def.name}: ${option.label}`}
                accessibilityState={{ selected }}
                style={[styles.choice, selected ? { backgroundColor: tint, borderColor: tone } : null]}
                onPress={() => setField(def.testKey, 'valueSingle', option.value)}
              >
                <Ionicons name={option.icon} size={18} color={selected ? tone : COLORS.textTertiary} />
                <Text style={[TYPE.bodyStrong, { color: selected ? tone : COLORS.textSecondary }]}>{option.label}</Text>
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <NumberField
          size="large"
          decimal
          width={120}
          unit={def.unit}
          align="left"
          value={shown('valueSingle')}
          onChangeText={(t) => updateField(def.testKey, 'valueSingle', t)}
          accessibilityLabel={def.name}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  heroNumber: { ...TYPE.display },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  banner: { backgroundColor: COLORS.warningTint },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  bannerText: { flex: 1 },
  alignStart: { alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  numberCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.elevated, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  titleText: { flex: 1 },
  descBody: { gap: SPACING.sm, paddingBottom: SPACING.xs },
  desc: { lineHeight: 20 },
  row: { flexDirection: 'row', gap: SPACING.md },
  side: { flex: 1, gap: SPACING.xs },
  choice: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.elevated,
  },
  helper: { textAlign: 'center' },
});
