// apps/mobile/components/PainPointPicker.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';
import type { PainPoint } from '../lib/sprintLifecycle';

export default function PainPointPicker({
  painPoints,
  onSelect,
}: {
  painPoints: readonly PainPoint[];
  onSelect: (painPoint: PainPoint) => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Pick a focus</Text>
      <Text style={sharedStyles.helperText}>One sprint at a time — 14 days, about 10 minutes a day.</Text>
      {painPoints.map((pp) => (
        <Pressable key={pp.id} style={sharedStyles.card} onPress={() => onSelect(pp)}>
          <Text style={sharedStyles.sectionTitle}>{pp.displayName}</Text>
          <Text style={sharedStyles.helperText}>{pp.description}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
