// apps/mobile/app/follow-list.tsx
//
// Followers / following of a profile (?userId=&kind=followers|following).
// On my own followers list each row can be removed.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import PersonRow from '../components/social/PersonRow';
import { fetchFollowList, removeFollower } from '../lib/social/follows';
import type { ProfileCard } from '../lib/social/profiles';
import { getMyId } from '../lib/session';

const PAGE = 50;

export default function FollowListScreen() {
  const router = useRouter();
  const { userId, kind } = useLocalSearchParams<{ userId: string; kind: string }>();
  const listKind = kind === 'following' ? 'following' : 'followers';
  const [people, setPeople] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [isMine, setIsMine] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([getMyId(), fetchFollowList(userId, listKind, 0, PAGE)]);
      setIsMine(me === userId);
      setPeople(list);
      setHasMore(list.length === PAGE);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [userId, listKind]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchFollowList(userId, listKind, people.length, PAGE);
      setPeople((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  function confirmRemove(p: ProfileCard) {
    Alert.alert(`Remove @${p.handle}?`, 'They will stop seeing your followers-only workouts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeFollower(p.id);
            setPeople((prev) => prev.filter((x) => x.id !== p.id));
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Could not remove follower.');
          }
        },
      },
    ]);
  }

  const title = listKind === 'following' ? 'Following' : 'Followers';

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title }} />
        <Text style={TYPE.body}>{error}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.dim]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={sharedStyles.screen}>
      <Stack.Screen options={{ title }} />
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={sharedStyles.screenContent}
        ListEmptyComponent={
          <Text style={sharedStyles.helperText}>
            {listKind === 'following' ? 'Not following anyone yet.' : 'No followers yet.'}
          </Text>
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable style={sharedStyles.primaryButton} disabled={loadingMore} onPress={loadMore}>
              <Text style={sharedStyles.primaryButtonText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <PersonRow
            person={item}
            onPress={() => router.push(`/profile/${item.id}`)}
            right={
              isMine && listKind === 'followers' ? (
                <Pressable onPress={() => confirmRemove(item)} hitSlop={8}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              ) : undefined
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
  remove: { color: COLORS.danger, fontWeight: '600' },
});
