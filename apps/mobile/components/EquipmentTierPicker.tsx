// apps/mobile/components/EquipmentTierPicker.tsx
//
// Three large selectable cards, one per equipment tier. Used by onboarding, the Settings
// "Equipment" sheet and the one-time prompt on the Workout tab.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { EQUIPMENT_TIER_OPTIONS, type EquipmentTier } from '../lib/equipmentTiers';
import { Card } from './ui';

interface Props {
  value: EquipmentTier | null;
  onSelect: (tier: EquipmentTier) => void;
  disabled?: boolean;
}

export default function EquipmentTierPicker({ value, onSelect, disabled }: Props) {
  return (
    <View style={styles.list}>
      {EQUIPMENT_TIER_OPTIONS.map((o) => {
        const selected = value === o.tier;
        return (
          <Card
            key={o.tier}
            variant={selected ? 'accent' : 'default'}
            onPress={disabled ? undefined : () => onSelect(o.tier)}
            accessibilityLabel={`${o.title}. ${o.subtitle}`}
          >
            <View style={styles.row}>
              <View style={styles.text}>
                <Text style={TYPE.bodyStrong}>{o.title}</Text>
                <Text style={TYPE.footnote}>{o.subtitle}</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={24} color={COLORS.accent} /> : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 56 },
  text: { flex: 1, gap: SPACING.xs },
});
