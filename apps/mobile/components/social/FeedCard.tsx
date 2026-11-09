// apps/mobile/components/social/FeedCard.tsx
//
// Feed post card (visual spec 4.15): author row, title, 3-line note with "more",
// optional 4:5 photo pager (double-tap likes), stat chips and like / comment actions.
// TODO(stage4): spec shows a PR chip and (on own posts) a visibility chip; FeedItem carries
// neither a PR count nor visibility, so they are not rendered.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MOTION, SPACING, TYPE } from '../../lib/theme';
import { durationLabel } from '../../lib/historyGrouping';
import { relativeTime } from '../../lib/social/time';
import type { FeedItem } from '../../lib/social/feed';
import Avatar from './Avatar';
import PhotoPager from './PhotoPager';
import { Button, Card, Chip, IconButton, PressableScale } from '../ui';

function LikeButton({ liked, count, onPress }: { liked: boolean; count: number; onPress: () => void }) {
  const scale = useSharedValue(1);
  const prev = useRef(liked);
  useEffect(() => {
    if (liked && !prev.current) scale.value = withSequence(withTiming(1.3, { duration: 90 }), withSpring(1, MOTION.popSpring));
    prev.current = liked;
  }, [liked, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <PressableScale haptic="none" onPress={onPress} hitSlop={8} style={styles.action} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
      <Animated.View style={style}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? COLORS.accent : COLORS.textTertiary} />
      </Animated.View>
      <Text style={[TYPE.callout, styles.count]}>{count}</Text>
    </PressableScale>
  );
}

export default function FeedCard({
  item,
  now,
  enterIndex,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onOpenComments,
  onMore,
}: {
  item: FeedItem;
  now: Date;
  /** Position for the staggered first-load enter animation; undefined = no animation. */
  enterIndex?: number;
  onOpen: () => void;
  onOpenAuthor: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  /** Report / hide / block menu; omitted for my own posts. */
  onMore?: () => void;
}) {
  const name = item.author?.displayName ?? 'Someone';
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  return (
    <Animated.View
      entering={enterIndex != null ? FadeInDown.duration(MOTION.base).delay(enterIndex * MOTION.stagger) : undefined}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.duration(MOTION.base)}
    >
      <Card>
        <View style={styles.authorRow}>
          <PressableScale style={styles.authorTap} onPress={onOpenAuthor} accessibilityLabel={`Open ${name}'s profile`}>
            <Avatar path={item.author?.avatarPath} name={name} size="sm" />
            <View style={styles.authorText}>
              <Text style={TYPE.bodyStrong} numberOfLines={1}>
                {name}
              </Text>
              <Text style={TYPE.footnote} numberOfLines={1}>
                {item.author ? `@${item.author.handle} · ` : ''}
                {relativeTime(item.endedAt, now)}
              </Text>
            </View>
          </PressableScale>
          {onMore ? <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="More options" onPress={onMore} /> : null}
        </View>

        <PressableScale scaleTo={0.99} onPress={onOpen} style={styles.body} accessibilityLabel={item.title}>
          <Text style={TYPE.title3}>{item.title}</Text>
          {item.notes ? (
            <Text
              style={TYPE.body}
              numberOfLines={expanded ? undefined : 3}
              onTextLayout={(e) => {
                if (!expanded) setTruncated(e.nativeEvent.lines.length > 3);
              }}
            >
              {item.notes}
            </Text>
          ) : null}
        </PressableScale>
        {item.notes && truncated && !expanded ? (
          <Button title="more" variant="ghost" size="sm" onPress={() => setExpanded(true)} style={styles.more} />
        ) : null}

        {item.mediaPaths.length > 0 ? (
          <PhotoPager paths={item.mediaPaths} onDoubleTap={item.likedByMe ? undefined : onToggleLike} />
        ) : null}

        <PressableScale scaleTo={0.99} onPress={onOpen} style={styles.chips} accessibilityLabel="Open workout">
          <Chip label={durationLabel(item.startedAt, item.endedAt)} />
          <Chip label={`${item.exerciseCount} ${item.exerciseCount === 1 ? 'exercise' : 'exercises'}`} />
          <Chip label={`${item.setCount} ${item.setCount === 1 ? 'set' : 'sets'}`} />
        </PressableScale>

        <View style={styles.actions}>
          <LikeButton liked={item.likedByMe} count={item.likeCount} onPress={onToggleLike} />
          <PressableScale onPress={onOpenComments} hitSlop={8} style={styles.action} accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={22} color={COLORS.textTertiary} />
            <Text style={[TYPE.callout, styles.count]}>{item.commentCount}</Text>
          </PressableScale>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  authorText: { flex: 1 },
  body: { gap: SPACING.xs },
  more: { alignSelf: 'flex-start', marginTop: -SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.xl, alignItems: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 44 },
  count: { fontVariant: ['tabular-nums'], color: COLORS.textSecondary },
});
