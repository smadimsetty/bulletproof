// apps/mobile/app/blocked.tsx
//
// Users I have blocked, with Unblock (visual spec 4.23).
// TODO(stage4): spec unblocks on a single tap; the existing confirm (it explains follows are
// not restored) is kept as a ConfirmSheet instead of being dropped.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import * as haptics from '../lib/haptics';
import { COLORS, MOTION, SPACING, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { fetchBlocked, unblock, type BlockedUser } from '../lib/social/safety';
import { useToast } from '../components/Toast';
import { Button, ConfirmSheet, EmptyState, ErrorState, SkeletonRow } from '../components/ui';

export default function BlockedScreen() {
  const toast = useToast();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<BlockedUser | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchBlocked());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function doUnblock(u: BlockedUser) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(u.id);
    try {
      await unblock(u.id);
      setConfirmUser(null);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      haptics.success();
      toast.show({ message: `Unblocked ${u.handle ? '@' + u.handle : u.displayName}`, tone: 'success' });
    } catch (err: any) {
      setConfirmUser(null);
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not unblock.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.pad}>
          {Array.from({ length: 5 }, (_, i) => (
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
              await load();
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
        data={users}
        keyExtractor={(u) => u.id}
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
            icon="hand-left-outline"
            title="No one blocked"
            body="People you block can't see your profile or workouts, and you won't see theirs."
            style={styles.empty}
          />
        }
        renderItem={({ item }) => (
          <Animated.View exiting={FadeOut.duration(MOTION.fast)} layout={LinearTransition.duration(MOTION.base)} style={styles.row}>
            <Avatar path={null} name={item.displayName} size="md" />
            <View style={styles.text}>
              <Text style={TYPE.bodyStrong} numberOfLines={1}>
                {item.displayName}
              </Text>
              {item.handle ? (
                <Text style={TYPE.footnote} numberOfLines={1}>
                  @{item.handle}
                </Text>
              ) : null}
            </View>
            <Button title="Unblock" variant="secondary" size="sm" disabled={busyId === item.id} onPress={() => setConfirmUser(item)} />
          </Animated.View>
        )}
      />
      <ConfirmSheet
        visible={confirmUser !== null}
        onClose={() => setConfirmUser(null)}
        title={confirmUser ? `Unblock ${confirmUser.handle ? '@' + confirmUser.handle : confirmUser.displayName}?` : 'Unblock?'}
        body="They will be able to find you again. Follows are not restored."
        confirmLabel="Unblock"
        loading={busyId !== null}
        onConfirm={() => confirmUser && doUnblock(confirmUser)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  empty: { marginTop: SPACING.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 68, paddingVertical: SPACING.sm },
  text: { flex: 1, gap: 2 },
});
