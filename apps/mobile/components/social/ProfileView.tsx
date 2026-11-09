// apps/mobile/components/social/ProfileView.tsx
//
// Profile body shared by the Profile tab (own, userId = null) and /profile/[userId]
// (visual spec 4.18-4.19). Private profiles show only the public card (name, handle,
// avatar, Private badge) with a lock card; counts, bio and workouts come back null / are
// never requested when the caller can't view details.
// TODO(stage4): spec's "Share" IconButton beside Edit profile has no share-profile behaviour
// behind it, so it is not rendered.
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BANNER_CLEARANCE, COLORS, SPACING, TYPE } from '../../lib/theme';
import Avatar from './Avatar';
import FollowButton from './FollowButton';
import WorkoutListRow from '../WorkoutListRow';
import { fetchProfile, type ProfileDetail } from '../../lib/social/profiles';
import { countFinishedWorkouts, fetchWorkoutHistory, type WorkoutListItem } from '../../lib/workouts';
import { fetchStatsDataset } from '../../lib/stats/dataset';
import { computeConsistency } from '../../lib/stats/consistency';
import { fetchUserSettings } from '../../lib/userSettings';
import { getMyId } from '../../lib/session';
import {
  AnimatedNumber, Badge, Button, Card, Chip, EmptyState, ErrorState, IconButton, LargeHeader, ScreenScroll, SectionHeader, Skeleton,
  SkeletonRow, SkeletonStat, Stat,
} from '../ui';

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
  // The tab root draws its own LargeHeader; pushed profiles use the native header.
  const isTabRoot = userId === null;

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

  const tabHeader = isTabRoot ? (
    <LargeHeader
      title={profile ? `@${profile.handle}` : 'Profile'}
      actions={
        profile ? <IconButton icon="settings-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} /> : undefined
      }
    />
  ) : null;

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {tabHeader}
          <View style={styles.identity}>
            <Skeleton width={96} height={96} radius={48} />
            <View style={styles.identityText}>
              <Skeleton width="60%" height={20} />
              <Skeleton width="40%" height={14} />
            </View>
          </View>
          <View style={styles.tiles}>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </View>
          <SkeletonRow />
          <SkeletonRow />
        </ScreenScroll>
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={styles.root}>
        <ScreenScroll>
          {tabHeader}
          <ErrorState
            message={error ?? 'This profile is unavailable.'}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load('initial');
              setRetrying(false);
            }}
          />
        </ScreenScroll>
      </View>
    );
  }

  const goList = (kind: 'followers' | 'following') =>
    router.push({ pathname: '/follow-list', params: { userId: profile.id, kind } });

  return (
    <View style={styles.root}>
      <ScreenScroll refreshing={refreshing} onRefresh={() => load('refresh')} contentContainerStyle={styles.content}>
        {tabHeader}

        <View style={styles.identity}>
          <Avatar path={profile.avatarPath} name={profile.displayName} size="xl" ring={isOwn && (streak ?? 0) >= 1} />
          <View style={styles.identityText}>
            <Text style={TYPE.title2} numberOfLines={2}>
              {profile.displayName}
            </Text>
            <View style={styles.handleRow}>
              <Text style={TYPE.footnote}>@{profile.handle}</Text>
              {!profile.isPublic ? <Badge label="Private" icon="lock-closed" /> : null}
              {!isOwn && profile.canViewDetails && profile.followsMe ? <Chip label="Follows you" /> : null}
            </View>
          </View>
        </View>

        {profile.canViewDetails && profile.bio ? (
          <Text style={[TYPE.body, { color: COLORS.textSecondary }]} numberOfLines={3}>
            {profile.bio}
          </Text>
        ) : null}

        {profile.canViewDetails ? (
          <View style={styles.tiles}>
            <Card padding={14} style={styles.tile}>
              <Stat size="md" label="Workouts" value={workoutCount ?? 0} />
            </Card>
            <Card padding={14} style={styles.tile} onPress={() => goList('followers')} accessibilityLabel="Followers">
              <Stat size="md" label="Followers" value={profile.followerCount ?? 0} />
            </Card>
            <Card padding={14} style={styles.tile} onPress={() => goList('following')} accessibilityLabel="Following">
              <Stat size="md" label="Following" value={profile.followingCount ?? 0} />
            </Card>
          </View>
        ) : null}

        {isOwn && profile.canViewDetails ? (
          <Card padding={14}>
            <View style={styles.streakRow}>
              <Ionicons name="flash" size={20} color={COLORS.accent} />
              <AnimatedNumber value={streak ?? 0} style={[TYPE.stat, { color: COLORS.accent }]} />
              <Text style={TYPE.overline}>Week streak</Text>
            </View>
          </Card>
        ) : null}

        {isOwn ? (
          <View style={styles.actionRow}>
            <Button title="Edit profile" variant="secondary" style={styles.flex} onPress={() => router.push('/edit-profile')} />
            <IconButton icon="person-add-outline" variant="filled" accessibilityLabel="Find people" onPress={() => router.push('/people')} />
          </View>
        ) : profile.canViewDetails ? (
          <FollowButton
            userId={profile.id}
            handle={profile.handle}
            status={profile.followStatus}
            followsMe={profile.followsMe}
            onChanged={() => load('focus')}
          />
        ) : null}

        {!profile.canViewDetails ? (
          <Card style={styles.privateCard}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={28} color={COLORS.textSecondary} />
            </View>
            <Text style={TYPE.title3}>This profile is private</Text>
            <Text style={[TYPE.callout, styles.center]}>
              {profile.followStatus === 'pending'
                ? 'Your follow request is waiting for approval.'
                : `Follow @${profile.handle} to see their workouts.`}
            </Text>
            <View style={styles.fullWidth}>
              <FollowButton
                userId={profile.id}
                handle={profile.handle}
                status={profile.followStatus}
                followsMe={profile.followsMe}
                onChanged={() => load('focus')}
              />
            </View>
          </Card>
        ) : (
          <>
            <SectionHeader title="Workouts" inset={SPACING.xs} />
            {workouts.length === 0 ? (
              <EmptyState
                compact
                icon="barbell-outline"
                title="No workouts yet"
                body={isOwn ? 'Finish one and it will show up here.' : 'No workouts to show yet.'}
                action={isOwn ? { label: 'Start a workout', onPress: () => router.navigate('/') } : undefined}
              />
            ) : (
              workouts.map((item) => (
                <WorkoutListRow key={item.id} item={item} onPress={() => router.push(`/workout-summary/${item.id}`)} />
              ))
            )}
            {hasMore ? <Button title="Load more" variant="secondary" fullWidth loading={loadingMore} onPress={loadMore} /> : null}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: BANNER_CLEARANCE },
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  identityText: { flex: 1, gap: SPACING.xs },
  handleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm },
  tiles: { flexDirection: 'row', gap: SPACING.md },
  tile: { flex: 1, minHeight: 96, justifyContent: 'center' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  flex: { flex: 1 },
  privateCard: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  center: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch', marginTop: SPACING.sm },
});
