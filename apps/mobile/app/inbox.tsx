// apps/mobile/app/inbox.tsx
//
// Activity inbox (visual spec 4.17). Follow requests get inline Approve / Decline; tapping any
// other row routes like the push notification's data.url. Opening the inbox marks everything
// read (after the list has loaded, so unread rows are still shown as unread on this visit).
// TODO(stage4): spec shows a 40pt workout thumbnail on like/comment rows; notifications don't
// carry the workout's photo, so it isn't rendered.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as haptics from '../lib/haptics';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { fetchNotifications, markAllRead, type AppNotification, type NotificationKind } from '../lib/social/notifications';
import { notificationRoute, notificationText } from '../lib/social/notificationFormat';
import { acceptFollow, declineFollow } from '../lib/social/follows';
import { relativeTime } from '../lib/social/time';
import { Button, EmptyState, ErrorState, IconButton, PressableScale, SectionHeader, SkeletonRow } from '../components/ui';
import type { IoniconName } from '../components/ui';

const GLYPH: Record<NotificationKind, { icon: IoniconName; color: string }> = {
  like: { icon: 'heart', color: COLORS.accent },
  comment: { icon: 'chatbubble', color: COLORS.chartLeft },
  follow_request: { icon: 'person-add', color: COLORS.textSecondary },
  follow_accepted: { icon: 'person-add', color: COLORS.success },
  new_follower: { icon: 'person-add', color: COLORS.textSecondary },
  report: { icon: 'flag', color: COLORS.warning },
};

const DOT_FADE_MS = 600;

/** Bold the leading "@handle" / "Someone" of a notification sentence. */
function Sentence({ text, who, done }: { text: string; who: string; done?: boolean }) {
  const rest = text.startsWith(who) ? text.slice(who.length) : null;
  return (
    <Text style={[TYPE.callout, { color: COLORS.textPrimary }]}>
      {rest !== null ? (
        <>
          <Text style={TYPE.bodyStrong}>{who}</Text>
          {done ? ' now follows you' : rest}
        </>
      ) : (
        text
      )}
    </Text>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [dotsFaded, setDotsFaded] = useState(false);
  // Follow requests already answered this visit: id -> outcome.
  const [answered, setAnswered] = useState<Record<string, 'accepted' | 'declined'>>({});
  const answeringRef = useRef<Set<string>>(new Set());
  const dotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dotTimer.current) clearTimeout(dotTimer.current);
    },
    []
  );

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const list = await fetchNotifications();
      setItems(list);
      setError(null);
      // Best effort; the unread badge just stays until the next successful open.
      if (list.some((n) => !n.readAt)) {
        markAllRead().catch(() => undefined);
        if (dotTimer.current) clearTimeout(dotTimer.current);
        dotTimer.current = setTimeout(() => setDotsFaded(true), DOT_FADE_MS);
      }
    } catch (err: any) {
      if (mode === 'initial') setError(err?.message ?? 'Failed to load.');
      else Alert.alert('Error', err?.message ?? 'Could not refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load('initial');
  }, [load]);

  async function answer(n: AppNotification, accept: boolean) {
    if (!n.actorId || answeringRef.current.has(n.id)) return;
    answeringRef.current.add(n.id);
    try {
      if (accept) await acceptFollow(n.actorId);
      else await declineFollow(n.actorId);
      if (accept) haptics.success();
      setAnswered((prev) => ({ ...prev, [n.id]: accept ? 'accepted' : 'declined' }));
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not update the request.');
    } finally {
      answeringRef.current.delete(n.id);
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          <ErrorState
            message={error}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load('initial');
              setRetrying(false);
            }}
          />
        </View>
      </View>
    );
  }

  const now = new Date();
  const requests = items.filter((n) => n.kind === 'follow_request');
  const earlier = items.filter((n) => n.kind !== 'follow_request');
  const sections = [
    ...(requests.length > 0 ? [{ title: 'Follow requests', data: requests }] : []),
    ...(earlier.length > 0 ? [{ title: 'Earlier', data: earlier }] : []),
  ];

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        indicatorStyle="white"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              haptics.tap();
              load('refresh');
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No activity yet"
            body="Likes, comments and follows will show up here."
            style={styles.empty}
          />
        }
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        renderItem={({ item }) => {
          const route = notificationRoute(item);
          const outcome = answered[item.id];
          const name = item.actor?.displayName ?? 'Someone';
          const who = item.actor?.handle ? `@${item.actor.handle}` : 'Someone';
          const unread = !item.readAt;
          const glyph = GLYPH[item.kind];
          const isRequest = item.kind === 'follow_request';
          return (
            <PressableScale
              style={[styles.row, unread ? styles.unreadRow : null]}
              scaleTo={0.99}
              disabled={!route || (isRequest && !outcome)}
              onPress={() => route && router.push(route)}
              accessibilityLabel={notificationText(item.kind, item.actor?.handle ?? null)}
            >
              <View style={styles.dotSlot}>
                {unread && !dotsFaded ? <Animated.View exiting={FadeOut.duration(200)} style={styles.dot} /> : null}
              </View>
              <View>
                <Avatar path={item.actor?.avatarPath} name={name} size="md" />
                <View style={styles.glyph}>
                  <Ionicons name={glyph.icon} size={11} color={glyph.color} />
                </View>
              </View>
              <View style={styles.text}>
                {isRequest && outcome === 'declined' ? (
                  <Text style={TYPE.callout}>Declined</Text>
                ) : (
                  <Sentence text={notificationText(item.kind, item.actor?.handle ?? null)} who={who} done={isRequest && outcome === 'accepted'} />
                )}
                <Text style={TYPE.footnote}>{relativeTime(item.createdAt, now)}</Text>
              </View>
              {isRequest && !outcome ? (
                <View style={styles.actions}>
                  <Button title="Approve" size="sm" onPress={() => answer(item, true)} />
                  <IconButton icon="close" size="sm" variant="filled" accessibilityLabel="Decline" onPress={() => answer(item, false)} />
                </View>
              ) : null}
              {isRequest && outcome === 'accepted' ? (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                </Animated.View>
              ) : null}
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  list: { paddingBottom: SPACING.xxl },
  empty: { marginTop: SPACING.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 68, paddingVertical: SPACING.md, paddingRight: SPACING.lg, paddingLeft: SPACING.xs },
  unreadRow: { backgroundColor: COLORS.surface },
  dotSlot: { width: SPACING.md, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  glyph: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.sheet,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});
