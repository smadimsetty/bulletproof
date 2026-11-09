// apps/mobile/components/social/VisibilityPicker.tsx
//
// Private / Followers / Public segmented control. Public is disabled (with a
// hint) unless the user's profile is public.
import { StyleSheet, Text, View } from 'react-native';
import { SPACING, TYPE } from '../../lib/theme';
import type { Visibility } from '../../lib/userSettings';
import { PUBLIC_DISABLED_HINT, VISIBILITY_OPTIONS } from '../../lib/social/visibility';
import { SegmentedControl } from '../ui';

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
      <SegmentedControl
        options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label, disabled: o.value === 'public' && !canPublic }))}
        value={value}
        onChange={onChange}
      />
      {!canPublic && <Text style={TYPE.footnote}>{PUBLIC_DISABLED_HINT}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
});
