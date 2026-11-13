// apps/mobile/components/PainPointPicker.tsx
//
// Visual spec 4.5a: 2x2 grid of pain-point cards, pick one, then "Start sprint" in the footer.
// onSelect still fires once, with the chosen pain point, when the footer button is pressed.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import * as haptics from '../lib/haptics';
import type { PainPoint } from '../lib/sprintLifecycle';
import { Button, PressableScale, StickyFooter } from './ui';
import { DescriptionBody } from './DescriptionToggle';
import SprintIcon from './SprintIcon';

export default function PainPointPicker({
  painPoints,
  onSelect,
  suggestedId,
}: {
  painPoints: readonly PainPoint[];
  onSelect: (painPoint: PainPoint) => void;
  /** The coach's suggestion after a retest: preselected and marked. */
  suggestedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    suggestedId && painPoints.some((p) => p.id === suggestedId) ? suggestedId : null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selected = painPoints.find((p) => p.id === selectedId) ?? null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} indicatorStyle="white">
        <Text style={TYPE.title1}>What's bothering you?</Text>
        <Text style={TYPE.body}>Pick one. You'll test it, train it daily for 14 days, then test again.</Text>
        <View style={styles.grid}>
          {painPoints.map((pp) => {
            const isSelected = pp.id === selectedId;
            const expanded = pp.id === expandedId;
            return (
              <PressableScale
                key={pp.id}
                haptic="select"
                scaleTo={0.97}
                onPress={() => setSelectedId(pp.id)}
                accessibilityLabel={pp.displayName}
                accessibilityState={{ selected: isSelected }}
                style={[styles.card, isSelected ? styles.cardSelected : null]}
              >
                {isSelected ? (
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={14} color={COLORS.onAccent} />
                  </View>
                ) : null}
                <View style={styles.iconCircle}>
                  <SprintIcon id={pp.id} size={32} color={COLORS.accent} />
                </View>
                <Text style={TYPE.title3}>{pp.displayName}</Text>
                {pp.id === suggestedId ? <Text style={styles.suggested}>Suggested next</Text> : null}
                {pp.tagline ? <Text style={TYPE.footnote}>{pp.tagline}</Text> : null}
                <PressableScale
                  haptic="select"
                  scaleTo={0.95}
                  hitSlop={8}
                  onPress={() => setExpandedId(expanded ? null : pp.id)}
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? 'Hide description' : 'Show description'}
                  accessibilityState={{ expanded }}
                  style={styles.moreRow}
                >
                  <Text style={styles.moreLabel}>{expanded ? 'Less' : 'More'}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textTertiary} />
                </PressableScale>
                <DescriptionBody open={expanded} text={pp.description} />
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
      <StickyFooter>
        <Button
          title="Start sprint"
          size="lg"
          fullWidth
          disabled={!selected}
          onPress={() => {
            if (selected) onSelect(selected);
          }}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  suggested: { ...TYPE.caption, color: COLORS.accent, fontWeight: '600' },
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  card: {
    width: '47.5%',
    flexGrow: 1,
    minHeight: 190,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  moreLabel: { ...TYPE.footnote, color: COLORS.textTertiary },
  cardSelected: { borderColor: COLORS.accent },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
