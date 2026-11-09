// apps/mobile/app/follow-list.tsx
//
// Followers / following of a profile (?userId=&kind=followers|following), visual spec 4.21.
// A SegmentedControl at the top switches `kind`. On my own followers list each row has a menu
// to remove the follower.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as haptics from '../lib/haptics';
import { COLORS, SPACING } from '../lib/theme';
import PersonRow from '../components/social/PersonRow';
import { fetchFollowList, removeFollower } from '../lib/social/follows';
import type { ProfileCard } from '../lib/social/profiles';
import { getMyId } from '../lib/session';
import { ActionSheet, Button, ConfirmSheet, EmptyState, ErrorState, IconButton, SegmentedControl, SkeletonRow } from '../components/ui';

const PAGE = 50;
// Let the ActionSheet finish dismissing before the ConfirmSheet presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 350;

export default function FollowListScreen() {
  const router = useRouter();
  const { userId, kind } = useLocalSearchParams<{ userId: string; kind: string }>();
  const listKind = kind === 'following' ? 'following' : 'followers';
  const [people, setPeople] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [isMine, setIsMine] = useState(false);
  const [menuPerson, setMenuPerson] = useState<ProfileCard | null>(null);
  const [removePerson, setRemovePerson] = useState<ProfileCard | null>(null);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);

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
    // Switching followers <-> following reloads under a skeleton rather than showing the other list.
    setLoading(true);
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

  async function doRemove(p: ProfileCard) {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    try {
      await removeFollower(p.id);
      setRemovePerson(null);
      setPeople((prev) => prev.filter((x) => x.id !== p.id));
      haptics.success();
    } catch (err: any) {
      setRemovePerson(null);
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not remove follower.');
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  }

  const title = listKind === 'following' ? 'Following' : 'Followers';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title }} />
      <View style={styles.switcher}>
        <SegmentedControl
          options={[
            { value: 'followers', label: 'Followers' },
            { value: 'following', label: 'Following' },
          ]}
          value={listKind}
          onChange={(next) => router.setParams({ kind: next })}
        />
      </View>
      {loading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          retrying={retrying}
          onRetry={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          indicatorStyle="white"
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={COLORS.accent}
              onRefresh={async () => {
                haptics.tap();
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={listKind === 'following' ? 'Not following anyone yet' : 'No followers yet'}
              action={isMine ? { label: 'Find people', onPress: () => router.push('/people') } : undefined}
              style={styles.empty}
            />
          }
          ListFooterComponent={
            hasMore ? <Button title="Load more" variant="secondary" fullWidth loading={loadingMore} onPress={loadMore} style={styles.more} /> : null
          }
          renderItem={({ item }) => (
            <PersonRow
              person={item}
              onPress={() => router.push(`/profile/${item.id}`)}
              right={
                isMine && listKind === 'followers' ? (
                  <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel={`More options for @${item.handle}`} onPress={() => setMenuPerson(item)} />
                ) : undefined
              }
            />
          )}
        />
      )}
      <ActionSheet
        visible={menuPerson !== null}
        onClose={() => setMenuPerson(null)}
        title={menuPerson ? `@${menuPerson.handle}` : undefined}
        actions={
          menuPerson
            ? [
                {
                  label: 'Remove follower',
                  icon: 'person-remove-outline',
                  destructive: true,
                  onPress: () => {
                    const p = menuPerson;
                    setTimeout(() => setRemovePerson(p), SHEET_HANDOFF_MS);
                  },
                },
              ]
            : []
        }
      />
      <ConfirmSheet
        visible={removePerson !== null}
        onClose={() => setRemovePerson(null)}
        title={removePerson ? `Remove @${removePerson.handle}?` : 'Remove follower?'}
        body="They will stop seeing your followers-only workouts."
        confirmLabel="Remove"
        destructive
        loading={removing}
        onConfirm={() => removePerson && doRemove(removePerson)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  switcher: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  skeletons: { paddingHorizontal: SPACING.lg, gap: SPACING.xs },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  empty: { marginTop: SPACING.xxl },
  more: { marginTop: SPACING.md },
});
