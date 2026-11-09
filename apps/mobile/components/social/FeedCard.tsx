// apps/mobile/components/social/FeedCard.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { durationLabel } from '../../lib/historyGrouping';
import { relativeTime } from '../../lib/social/time';
import type { FeedItem } from '../../lib/social/feed';
import Avatar from './Avatar';
import PhotoPager from './PhotoPager';

export default function FeedCard({
  item,
  now,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onOpenComments,
  onMore,
}: {
  item: FeedItem;
  now: Date;
  onOpen: () => void;
  onOpenAuthor: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  /** Report / hide / block menu; omitted for my own posts. */
  onMore?: () => void;
}) {
  const name = item.author?.displayName ?? 'Someone';
  return (
    <View style={sharedStyles.card}>
      <View style={styles.authorRow}>
        <Pressable style={styles.authorTap} onPress={onOpenAuthor}>
          <Avatar path={item.author?.avatarPath} name={name} size={36} />
          <View style={styles.authorText}>
            <Text style={TYPE.label} numberOfLines={1}>{name}</Text>
            <Text style={sharedStyles.helperText} numberOfLines={1}>
              {item.author ? `@${item.author.handle} · ` : ''}{relativeTime(item.endedAt, now)}
            </Text>
          </View>
        </Pressable>
        {onMore && (
          <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.muted} />
          </Pressable>
        )}
      </View>

      <Pressable onPress={onOpen} style={styles.body}>
        <Text style={TYPE.sectionTitle}>{item.title}</Text>
        {!!item.notes && (
          <Text style={TYPE.body} numberOfLines={3}>{item.notes}</Text>
        )}
      </Pressable>

      {item.mediaPaths.length > 0 && <PhotoPager paths={item.mediaPaths} />}

      <Pressable onPress={onOpen} style={styles.chips}>
        <View style={sharedStyles.chip}>
          <Text style={sharedStyles.chipText}>{durationLabel(item.startedAt, item.endedAt)}</Text>
        </View>
        <View style={sharedStyles.chip}>
          <Text style={sharedStyles.chipText}>{item.exerciseCount} {item.exerciseCount === 1 ? 'exercise' : 'exercises'}</Text>
        </View>
        <View style={sharedStyles.chip}>
          <Text style={sharedStyles.chipText}>{item.setCount} {item.setCount === 1 ? 'set' : 'sets'}</Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onToggleLike} hitSlop={8} accessibilityLabel={item.likedByMe ? 'Unlike' : 'Like'}>
          <Ionicons name={item.likedByMe ? 'heart' : 'heart-outline'} size={22} color={item.likedByMe ? COLORS.danger : COLORS.muted} />
          <Text style={styles.count}>{item.likeCount}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onOpenComments} hitSlop={8} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={20} color={COLORS.muted} />
          <Text style={styles.count}>{item.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  authorText: { flex: 1 },
  body: { gap: SPACING.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.lg, paddingTop: SPACING.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  count: { ...TYPE.label, color: COLORS.muted },
});
