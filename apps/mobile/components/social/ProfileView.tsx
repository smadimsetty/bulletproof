// apps/mobile/components/social/ProfileView.tsx
//
// Profile body shared by the Profile tab (own, userId = null) and
// /profile/[userId]. Private profiles show only the public card (name,
// handle, avatar, Private badge); counts, bio and workouts come back null /
// are never requested when the caller can't view details.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../../lib/theme';
import Avatar from './Avatar';
import FollowButton from './FollowButton';
import WorkoutListRow from '../WorkoutListRow';
import { fetchProfile, type ProfileDetail } from '../../lib/social/profiles';
import { countFinishedWorkouts, fetchWorkoutHistory, type WorkoutListItem } from '../../lib/workouts';
import { fetchStatsDataset } from '../../lib/stats/dataset';
import { computeConsistency } from '../../lib/stats/consistency';
import { fetchUserSettings } from '../../lib/userSettings';
import { getMyId } from '../../lib/session';

const PAGE = 20;

export default function ProfileView({ userId, onLoaded }: { userId: string | null; onLoaded?: (p: ProfileDetail) => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [isOwn, setIsOwn] = useState(false);
  const [workoutCount, setWorkoutCount] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'focus') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const me = await getMyId();
        const id = userId ?? me;
        const p = await fetchProfile(id);
        const own = id === me;
        let count: number | null = null;
        let streakWeeks: number | null = null;
        let list: WorkoutListItem[] = [];
        if (p.canViewDetails) {
          [count, list] = await Promise.all([countFinishedWorkouts(id), fetchWorkoutHistory(null, PAGE, id)]);
          if (own) {
            // Streak is only meaningful for my own complete history and goal.
            const [dataset, settings] = await Promise.all([fetchStatsDataset(), fetchUserSettings()]);
            streakWeeks = computeConsistency(
              dataset.map((w) => w.endedAt),
              settings.weeklyGoal,
              new Date()
            ).currentStreak;
          }
        }
        setProfile(p);
        setIsOwn(own);
        setWorkoutCount(count);
        setStreak(streakWeeks);
        setWorkouts(list);
        setHasMore(list.length === PAGE);
        setError(null);
        loadedRef.current = true;
        onLoaded?.(p);
      } catch (err: any) {
        // Only a first load blanks to an error screen; later reloads keep the stale view.
        if (mode === 'initial' || !loadedRef.current) setError(err?.message ?? 'Failed to load this profile.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, onLoaded]
  );

  useFocusEffect(
    useCallback(() => {
      load(loadedRef.current ? 'focus' : 'initial');
    }, [load])
  );

  async function loadMore() {
    if (loadingMore || !profile) return;
    setLoadingMore(true);
    try {
      const last = workouts[workouts.length - 1];
      const page = await fetchWorkoutHistory(last ? { endedAt: last.endedAt!, id: last.id } : null, PAGE, profile.id);
      setWorkouts((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE);
    } catch {
      // The button stays; tapping again retries.
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{error ?? 'This profile is unavailable.'}</Text>
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

  const goList = (kind: 'followers' | 'following') =>
    router.push({ pathname: '/follow-list', params: { userId: profile.id, kind } });

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.accent} />}
    >
      <View style={sharedStyles.card}>
        <View style={styles.headerRow}>
          <Avatar path={profile.avatarPath} name={profile.displayName} size={72} />
          <View style={styles.headerText}>
            <Text style={TYPE.screenTitle} numberOfLines={1}>{profile.displayName}</Text>
            <Text style={sharedStyles.helperText}>@{profile.handle}</Text>
            {!profile.isPublic && (
              <View style={[sharedStyles.chip, styles.badge]}>
                <Ionicons name="lock-closed-outline" size={12} color={COLORS.accent} />
                <Text style={styles.badgeText}>Private</Text>
              </View>
            )}
          </View>
        </View>
        {!!profile.bio && <Text style={TYPE.body}>{profile.bio}</Text>}

        {profile.canViewDetails && (
          <View style={styles.countsRow}>
            <Pressable onPress={() => goList('followers')} style={styles.count}>
              <Text style={styles.countValue}>{profile.followerCount ?? 0}</Text>
              <Text style={sharedStyles.helperText}>Followers</Text>
            </Pressable>
            <Pressable onPress={() => goList('following')} style={styles.count}>
              <Text style={styles.countValue}>{profile.followingCount ?? 0}</Text>
              <Text style={sharedStyles.helperText}>Following</Text>
            </Pressable>
            <View style={styles.count}>
              <Text style={styles.countValue}>{workoutCount ?? 0}</Text>
              <Text style={sharedStyles.helperText}>Workouts</Text>
            </View>
            {isOwn && (
              <View style={styles.count}>
                <Text style={styles.countValue}>{streak ?? 0}</Text>
                <Text style={sharedStyles.helperText}>Week streak</Text>
              </View>
            )}
          </View>
        )}

        {isOwn ? (
          <View style={styles.actionRow}>
            <Pressable style={[sharedStyles.primaryButton, styles.flex]} onPress={() => router.push('/edit-profile')}>
              <Text style={sharedStyles.primaryButtonText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => router.push('/people')} accessibilityLabel="Find people">
              <Ionicons name="person-add-outline" size={20} color={COLORS.accent} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
              <Ionicons name="settings-outline" size={20} color={COLORS.accent} />
            </Pressable>
          </View>
        ) : (
          <FollowButton
            userId={profile.id}
            handle={profile.handle}
            status={profile.followStatus}
            followsMe={profile.followsMe}
            onChanged={() => load('focus')}
          />
        )}
      </View>

      {!profile.canViewDetails ? (
        <View style={sharedStyles.card}>
          <Text style={TYPE.sectionTitle}>This account is private</Text>
          <Text style={sharedStyles.helperText}>
            {profile.followStatus === 'pending'
              ? 'Your follow request is waiting for approval.'
              : 'Follow to request access to their workouts.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={TYPE.sectionTitle}>Workouts</Text>
          {workouts.length === 0 ? (
            <Text style={sharedStyles.helperText}>
              {isOwn ? 'No workouts yet — finish one to see it here.' : 'No workouts to show yet.'}
            </Text>
          ) : (
            workouts.map((item) => (
              <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />
            ))
          )}
          {hasMore && (
            <Pressable style={sharedStyles.primaryButton} disabled={loadingMore} onPress={loadMore}>
              <Text style={sharedStyles.primaryButtonText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerText: { flex: 1, gap: 2 },
  badge: { alignSelf: 'flex-start', marginTop: SPACING.xs },
  badgeText: { ...TYPE.helper, color: COLORS.accent, fontWeight: '600' },
  countsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACING.sm },
  count: { alignItems: 'center' },
  countValue: { fontSize: 20, fontWeight: '700', color: COLORS.ink },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
