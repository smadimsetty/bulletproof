// apps/mobile/components/social/PersonRow.tsx
//
// Person list row (visual spec 4.20): avatar, name, @handle (+ lock for private) and an
// optional trailing slot (follow button, remove menu, ...).
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import type { ProfileCard } from '../../lib/social/profiles';
import Avatar from './Avatar';
import { PressableScale } from '../ui';

export default function PersonRow({
  person,
  onPress,
  right,
}: {
  person: ProfileCard;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <PressableScale
      style={styles.row}
      scaleTo={0.98}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`${person.displayName}, @${person.handle}`}
    >
      <Avatar path={person.avatarPath} name={person.displayName} size="md" />
      <View style={styles.text}>
        <Text style={TYPE.bodyStrong} numberOfLines={1}>
          {person.displayName}
        </Text>
        <View style={styles.handleRow}>
          <Text style={TYPE.footnote} numberOfLines={1}>
            @{person.handle}
          </Text>
          {!person.isPublic ? <Ionicons name="lock-closed-outline" size={12} color={COLORS.textTertiary} /> : null}
        </View>
      </View>
      {right}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 64, paddingVertical: SPACING.sm },
  text: { flex: 1, gap: 2 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
