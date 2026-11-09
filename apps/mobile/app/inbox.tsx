// apps/mobile/app/inbox.tsx
//
// Activity inbox. Follow requests get inline Approve / Decline; tapping any
// other row routes like the push notification's data.url. Opening the inbox
// marks everything read (after the list has loaded, so unread rows are still
// shown as unread on this visit).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { fetchNotifications, markAllRead, type AppNotification } from '../lib/social/notifications';
import { notificationRoute, notificationText } from '../lib/social/notificationFormat';
import { acceptFollow, declineFollow } from '../lib/social/follows';
import { relativeTime } from '../lib/social/time';

export default function InboxScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Follow requests already answered this visit: id -> outcome.
  const [answered, setAnswered] = useState<Record<string, 'accepted' | 'declined'>>({});
  const answeringRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const list = await fetchNotifications();
      setItems(list);
      setError(null);
      // Best effort; the unread badge just stays until the next successful open.
      if (list.some((n) => !n.readAt)) markAllRead().catch(() => undefined);
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
      setAnswered((prev) => ({ ...prev, [n.id]: accept ? 'accepted' : 'declined' }));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not update the request.');
    } finally {
      answeringRef.current.delete(n.id);
    }
  }

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

  const now = new Date();
  return (
    <FlatList
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
      ListEmptyComponent={<Text style={sharedStyles.helperText}>Nothing yet. Likes, comments and follows show up here.</Text>}
      renderItem={({ item }) => {
        const route = notificationRoute(item);
        const outcome = answered[item.id];
        const name = item.actor?.displayName ?? 'Someone';
        return (
          <Pressable
            style={[sharedStyles.card, styles.row, !item.readAt && styles.unread]}
            disabled={!route}
            onPress={() => route && router.push(route)}
          >
            <Avatar path={item.actor?.avatarPath} name={name} size={40} />
            <View style={styles.text}>
              <Text style={TYPE.body}>{notificationText(item.kind, item.actor?.handle ?? null)}</Text>
              <Text style={sharedStyles.helperText}>{relativeTime(item.createdAt, now)}</Text>
              {item.kind === 'follow_request' && (
                outcome ? (
                  <Text style={sharedStyles.helperText}>{outcome === 'accepted' ? 'Approved' : 'Declined'}</Text>
                ) : (
                  <View style={styles.actions}>
                    <Pressable style={[sharedStyles.primaryButton, styles.actionBtn]} onPress={() => answer(item, true)}>
                      <Text style={sharedStyles.primaryButtonText}>Approve</Text>
                    </Pressable>
                    <Pressable style={[styles.declineBtn]} onPress={() => answer(item, false)}>
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                )
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
  row: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  unread: { borderLeftWidth: 3, borderLeftColor: COLORS.accent },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: SPACING.xs },
  actionBtn: { paddingHorizontal: SPACING.lg },
  declineBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  declineText: { color: COLORS.danger, fontWeight: '600' },
});
