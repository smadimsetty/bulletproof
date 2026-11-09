// apps/mobile/components/social/PersonRow.tsx
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import type { ProfileCard } from '../../lib/social/profiles';
import Avatar from './Avatar';

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
    <Pressable style={[sharedStyles.card, styles.row]} onPress={onPress} disabled={!onPress}>
      <Avatar path={person.avatarPath} name={person.displayName} size={44} />
      <View style={styles.text}>
        <Text style={TYPE.label} numberOfLines={1}>{person.displayName}</Text>
        <View style={styles.handleRow}>
          <Text style={sharedStyles.helperText} numberOfLines={1}>@{person.handle}</Text>
          {!person.isPublic && <Ionicons name="lock-closed-outline" size={12} color={COLORS.muted} />}
        </View>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  text: { flex: 1 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
