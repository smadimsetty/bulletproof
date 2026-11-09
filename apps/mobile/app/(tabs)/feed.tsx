// apps/mobile/app/(tabs)/feed.tsx
//
// Feed tab: workouts from me and the people I follow, newest first, keyset
// paged. Bell (unread count) -> inbox, people icon -> find people.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../../lib/theme';
import FeedCard from '../../components/social/FeedCard';
import { fetchFeed, type FeedItem } from '../../lib/social/feed';
import type { FeedCursor } from '../../lib/social/feedCursor';
import { setLiked } from '../../lib/social/interactions';
import { fetchUnreadCount } from '../../lib/social/notifications';
import { getMyId } from '../../lib/session';
import { useSafety } from '../../components/social/ReportSheet';
import { hideWorkout } from '../../lib/social/safety';

export default function FeedTab() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [unread, setUnread] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  const loadedRef = useRef(false);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const patch = (liked: boolean, delta: number) =>
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, likedByMe: liked, likeCount: Math.max(0, i.likeCount + delta) } : i))
      );
    patch(next, next ? 1 : -1); // optimistic
    try {
      await setLiked(item.id, next);
    } catch (err: any) {
      patch(!next, next ? -1 : 1); // roll back
      Alert.alert('Error', err?.message ?? 'Could not update your like.');
    } finally {
      likingRef.current.delete(item.id);
    }
  }

  const dropItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  function openMenu(item: FeedItem) {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      {
        text: 'Report workout',
        onPress: () => safety.openReport({ type: 'workout', id: item.id, label: 'this workout', after: () => dropItem(item.id) }),
      },
      {
        text: 'Hide from my feed',
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
      buttons.push({
        text: `Block @${author.handle}`,
        style: 'destructive',
        onPress: () =>
          safety.confirmBlock(author, () => setItems((prev) => prev.filter((i) => i.ownerId !== author.id))),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Workout', undefined, buttons);
  }

  const now = new Date();

  const header = (
    <View style={styles.headerRow}>
      <Text style={TYPE.screenTitle}>Feed</Text>
      <View style={styles.headerIcons}>
        <Pressable onPress={() => router.push('/people')} hitSlop={8} accessibilityLabel="Find people">
          <Ionicons name="people-outline" size={24} color={COLORS.accent} />
        </Pressable>
        <Pressable onPress={() => router.push('/inbox')} hitSlop={8} accessibilityLabel="Inbox">
          <Ionicons name="notifications-outline" size={24} color={COLORS.accent} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{error}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.dim]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load('initial');
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      data={items}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={[sharedStyles.card, styles.empty]}>
          <Text style={TYPE.sectionTitle}>Follow friends to see their workouts</Text>
          <Text style={sharedStyles.helperText}>Workouts you and the people you follow share show up here.</Text>
          <Pressable style={sharedStyles.primaryButton} onPress={() => router.push('/people')}>
            <Text style={sharedStyles.primaryButtonText}>Find people</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.accent} /> : null}
      renderItem={({ item }) => (
        <FeedCard
          item={item}
          now={now}
          onOpen={() => router.push(`/workout-summary/${item.id}`)}
          onOpenAuthor={() => router.push(`/profile/${item.ownerId}`)}
          onToggleLike={() => toggleLike(item)}
          onOpenComments={() => router.push(`/comments/${item.id}`)}
          onMore={item.ownerId === meId ? undefined : () => openMenu(item)}
        />
      )}
    />
    {safety.element}
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: COLORS.card, fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'stretch' },
});
