// apps/mobile/app/(tabs)/feed.tsx
//
// Feed tab (visual spec 4.15): workouts from me and the people I follow, newest first, keyset
// paged. Person-add -> find people, bell (unread count) -> inbox.
// TODO(stage4): spec splits the empty state into "follows nobody" / "follows people, no posts";
// the feed query doesn't report the follow count, so one "quiet" state is shown.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { BANNER_CLEARANCE, COLORS, SPACING, TYPE } from '../../lib/theme';
import FeedCard from '../../components/social/FeedCard';
import { fetchFeed, type FeedItem } from '../../lib/social/feed';
import type { FeedCursor } from '../../lib/social/feedCursor';
import { setLiked } from '../../lib/social/interactions';
import { emitUnreadChanged, fetchUnreadCount } from '../../lib/social/notifications';
import { getMyId } from '../../lib/session';
import { useSafety } from '../../components/social/ReportSheet';
import { hideWorkout } from '../../lib/social/safety';
import { useToast } from '../../components/Toast';
import { ActionSheet, Card, EmptyState, ErrorState, IconButton, LargeHeader, Skeleton, SkeletonRow, type ActionSheetAction } from '../../components/ui';

// Let an ActionSheet finish dismissing before the next Modal presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 350;
const ENTER_COUNT = 8;

function FeedSkeletonCard() {
  return (
    <Card>
      <SkeletonRow />
      <Skeleton width="100%" height={260} radius={14} />
      <Skeleton width="70%" height={12} />
    </Card>
  );
}

export default function FeedTab() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [unread, setUnread] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const loadedRef = useRef(false);
  // Staggered enter animation: first 8 cards of the very first paint only (not refresh / paging).
  const animatedRef = useRef(false);
  const enterIndexFor = (index: number) => (!animatedRef.current && index < ENTER_COUNT ? index : undefined);
  useEffect(() => {
    if (items.length > 0) animatedRef.current = true;
  }, [items]);
  // Synchronous per-workout guard against double-tapped likes.
  const likingRef = useRef<Set<string>>(new Set());
  const safety = useSafety();

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [page, count, me] = await Promise.all([
        fetchFeed(null),
        fetchUnreadCount().catch(() => 0),
        getMyId(),
      ]);
      setItems(page.items);
      setCursor(page.cursor);
      setUnread(count);
      setMeId(me);
      setError(null);
      loadedRef.current = true;
      emitUnreadChanged();
    } catch (err: any) {
      if (mode === 'initial' || !loadedRef.current) setError(err?.message ?? 'Failed to load the feed.');
      else if (mode === 'refresh') Alert.alert('Error', err?.message ?? 'Could not refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(loadedRef.current ? 'focus' : 'initial');
    }, [load])
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchFeed(cursor);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.cursor);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleLike(item: FeedItem) {
    if (likingRef.current.has(item.id)) return;
    likingRef.current.add(item.id);
    const next = !item.likedByMe;
    if (next) haptics.tap(); // spec: like fires a light impact, unlike is silent
    const patch = (liked: boolean, delta: number) =>
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, likedByMe: liked, likeCount: Math.max(0, i.likeCount + delta) } : i))
      );
    patch(next, next ? 1 : -1); // optimistic
    try {
      await setLiked(item.id, next);
    } catch (err: any) {
      patch(!next, next ? -1 : 1); // roll back
      toast.show({
        message: "Couldn't update your like",
        tone: 'danger',
        action: { label: 'Retry', onPress: () => void toggleLike(item) },
      });
    } finally {
      likingRef.current.delete(item.id);
    }
  }

  const dropItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  function menuActions(item: FeedItem): ActionSheetAction[] {
    const later = (fn: () => void) => () => {
      setTimeout(fn, SHEET_HANDOFF_MS);
    };
    const actions: ActionSheetAction[] = [
      {
        label: 'Report workout',
        icon: 'flag-outline',
        onPress: later(() => safety.openReport({ type: 'workout', id: item.id, label: 'this workout', after: () => dropItem(item.id) })),
      },
      {
        label: 'Hide from my feed',
        icon: 'eye-off-outline',
        onPress: async () => {
          try {
            await hideWorkout(item.id);
            dropItem(item.id);
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Could not hide this workout.');
          }
        },
      },
    ];
    if (item.author) {
      const author = item.author;
      actions.push({
        label: `Block @${author.handle}`,
        icon: 'ban-outline',
        destructive: true,
        onPress: later(() => safety.confirmBlock(author, () => setItems((prev) => prev.filter((i) => i.ownerId !== author.id)))),
      });
    }
    return actions;
  }

  const now = new Date();

  const header = (
    <LargeHeader
      title="Feed"
      actions={
        <>
          <IconButton icon="person-add-outline" accessibilityLabel="Find people" onPress={() => router.push('/people')} />
          <IconButton icon="notifications-outline" accessibilityLabel="Inbox" badge={unread} onPress={() => router.push('/inbox')} />
        </>
      }
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          {header}
          <FeedSkeletonCard />
          <FeedSkeletonCard />
          <FeedSkeletonCard />
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          {header}
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

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        indicatorStyle="white"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Your feed is quiet"
            body="Follow friends to see their workouts here."
            action={{ label: 'Find people', onPress: () => router.push('/people') }}
            style={styles.empty}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={COLORS.accent} style={styles.footer} />
          ) : items.length > 0 && !cursor ? (
            <View style={styles.caughtUp}>
              <Ionicons name="checkmark-done" size={16} color={COLORS.textTertiary} />
              <Text style={TYPE.footnote}>You're all caught up</Text>
            </View>
          ) : (
            <View style={styles.footer} />
          )
        }
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            now={now}
            enterIndex={enterIndexFor(index)}
            onOpen={() => router.push(`/workout-summary/${item.id}`)}
            onOpenAuthor={() => router.push(`/profile/${item.ownerId}`)}
            onToggleLike={() => toggleLike(item)}
            onOpenComments={() => router.push(`/comments/${item.id}`)}
            onMore={item.ownerId === meId ? undefined : () => setMenuItem(item)}
          />
        )}
      />
      <ActionSheet
        visible={menuItem !== null}
        onClose={() => setMenuItem(null)}
        title="Workout"
        actions={menuItem ? menuActions(menuItem) : []}
      />
      {safety.element}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.md },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: BANNER_CLEARANCE },
  separator: { height: SPACING.md },
  empty: { marginTop: SPACING.xxl },
  footer: { height: SPACING.xl, marginTop: SPACING.md },
  caughtUp: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
});
