// apps/mobile/components/social/VisibilityPicker.tsx
//
// Private / Followers / Public segmented control. Public is disabled (with a
// hint) unless the user's profile is public.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, LEGACY_SPACING as SPACING, sharedStyles } from '../../lib/theme';
import type { Visibility } from '../../lib/userSettings';
import { PUBLIC_DISABLED_HINT, VISIBILITY_OPTIONS } from '../../lib/social/visibility';

export default function VisibilityPicker({
  value,
  onChange,
  canPublic,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  canPublic: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {VISIBILITY_OPTIONS.map((o) => {
          const disabled = o.value === 'public' && !canPublic;
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              disabled={disabled}
              onPress={() => onChange(o.value)}
              style={[styles.segment, active && styles.segmentActive, disabled && styles.segmentDisabled]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!canPublic && <Text style={sharedStyles.helperText}>{PUBLIC_DISABLED_HINT}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  row: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.button, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', backgroundColor: COLORS.card },
  segmentActive: { backgroundColor: COLORS.accent },
  segmentDisabled: { opacity: 0.4 },
  label: { color: COLORS.ink, fontWeight: '500', fontSize: 14 },
  labelActive: { color: COLORS.card, fontWeight: '700' },
});
