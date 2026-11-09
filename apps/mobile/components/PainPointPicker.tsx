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

type IconName = keyof typeof Ionicons.glyphMap;

function iconFor(pp: PainPoint): IconName {
  const n = `${pp.displayName} ${pp.id}`.toLowerCase();
  if (n.includes('ankle')) return 'footsteps-outline';
  if (n.includes('shoulder')) return 'body-outline';
  if (n.includes('neck')) return 'phone-portrait-outline';
  if (n.includes('pelvic') || n.includes('pelvis')) return 'git-commit-outline';
  return 'flash-outline';
}

export default function PainPointPicker({
  painPoints,
  onSelect,
}: {
  painPoints: readonly PainPoint[];
  onSelect: (painPoint: PainPoint) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = painPoints.find((p) => p.id === selectedId) ?? null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} indicatorStyle="white">
        <Text style={TYPE.title1}>What's bothering you?</Text>
        <Text style={TYPE.body}>Pick one. You'll test it, train it daily for 14 days, then test again.</Text>
        <View style={styles.grid}>
          {painPoints.map((pp) => {
            const isSelected = pp.id === selectedId;
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
                  <Ionicons name={iconFor(pp)} size={32} color={COLORS.accent} />
                </View>
                <Text style={TYPE.title3}>{pp.displayName}</Text>
                <Text style={TYPE.footnote} numberOfLines={3}>
                  {pp.description}
                </Text>
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
