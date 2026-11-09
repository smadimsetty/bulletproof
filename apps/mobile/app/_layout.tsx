// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription and the
// HealthKit-sync/recommendations-fetch side effects. Also keeps the workout
// Live Activity in sync with the in-progress workout (lib/workoutActivityBridge.ts).
// The `recommendations` fetch below is
// intentionally left in place though nothing renders it: it's the mobile
// side of the old daily-recommendation engine, which stays running
// dormant rather than being torn out.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isHealthKitSyncEnabled, syncHealthKitWorkouts, syncHealthKitDailyMetrics } from '../lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';
import { fetchActiveWorkout, subscribeToActiveWorkoutChanges } from '../lib/workouts';
import { syncWorkoutLiveActivity } from '../lib/workoutActivityBridge';
import { fetchMyProfile, subscribeToProfileChanges } from '../lib/social/profiles';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

type ProfileGate = 'loading' | 'needs_onboarding' | 'ready' | 'error';

const INITIAL_RECOMMENDATIONS_STATE: RecommendationsState = {
  today: null,
  yesterday: null,
  loading: true,
  error: null,
};

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsState>(
    INITIAL_RECOMMENDATIONS_STATE
  );
  const [profileGate, setProfileGate] = useState<ProfileGate>('loading');
  const [profileError, setProfileError] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const hadSession = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Decides onboarding vs tabs. A silent re-check (after onboarding or a profile
  // edit) never knocks an already-ready app back to a loading/error screen.
  const checkProfile = useCallback(async () => {
    try {
      const profile = await fetchMyProfile();
      setProfileGate(profile ? 'ready' : 'needs_onboarding');
      setProfileError(null);
    } catch (err: any) {
      setProfileGate((prev) => {
        if (prev === 'ready') return prev;
        setProfileError(err?.message ?? 'Could not load your profile.');
        return 'error';
      });
    }
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    setProfileGate('loading');
    setProfileError(null);
    if (userId) checkProfile();
  }, [userId, checkProfile]);
  useEffect(() => subscribeToProfileChanges(() => { checkProfile(); }), [checkProfile]);

  const loadRecommendations = useCallback(async () => {
    try {
      const result = await fetchRecommendations(new Date());
      setRecommendations({
        today: result.today,
        yesterday: result.yesterday,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setRecommendations((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? 'Failed to load recommendations',
      }));
    }
  }, []);

  const runHealthKitSyncIfEnabled = useCallback(async (label: string) => {
    const enabled = await isHealthKitSyncEnabled().catch(() => false);
    if (!enabled) {
      return;
    }
    syncHealthKitWorkouts().catch((err) => {
      console.warn(`HealthKit sync failed on ${label}:`, err);
    });
    syncHealthKitDailyMetrics().catch((err) => {
      console.warn(`HealthKit daily metrics sync failed on ${label}:`, err);
    });
  }, []);

  const refreshLiveActivity = useCallback(() => {
    fetchActiveWorkout()
      .then(syncWorkoutLiveActivity)
      .catch((err) => console.warn('Active workout fetch failed:', err));
  }, []);

  useEffect(() => {
    if (!session) {
      // Signed out: the lock-screen activity must not outlive the session.
      // (Not on cold start, where session is briefly null before getSession.)
      if (hadSession.current) syncWorkoutLiveActivity(null);
      hadSession.current = false;
      return;
    }
    hadSession.current = true;

    runHealthKitSyncIfEnabled('launch');
    loadRecommendations();
    refreshLiveActivity();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        runHealthKitSyncIfEnabled('foreground');
        loadRecommendations();
        refreshLiveActivity();
      }
      appState.current = nextState;
    });
    const unsubscribeWorkout = subscribeToActiveWorkoutChanges(refreshLiveActivity);

    return () => {
      subscription.remove();
      unsubscribeWorkout();
    };
  }, [session, loadRecommendations, runHealthKitSyncIfEnabled, refreshLiveActivity]);

  const showApp = !!session && profileGate === 'ready';
  const showGate = !!session && (profileGate === 'loading' || profileGate === 'error');

  return (
    <View style={styles.root}>
      <Stack>
        <Stack.Protected guard={showApp}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="workout/[workoutId]" options={{ title: 'Workout', headerBackTitle: 'Back' }} />
          <Stack.Screen name="workout-summary/[workoutId]" options={{ title: 'Workout', headerBackTitle: 'Back' }} />
          <Stack.Screen name="sprint" options={{ title: 'Sprint', headerBackTitle: 'Back' }} />
          <Stack.Screen name="recap" options={{ title: 'Monthly recap', headerBackTitle: 'Back' }} />
          <Stack.Screen name="exercise/[exerciseId]" options={{ title: 'Exercise', headerBackTitle: 'Back' }} />
          <Stack.Screen name="routines/[routineId]" options={{ title: 'Routine', headerBackTitle: 'Back' }} />
          <Stack.Screen name="library/index" options={{ title: 'Exercises', headerBackTitle: 'Back' }} />
          <Stack.Screen name="library/new" options={{ title: 'New exercise', headerBackTitle: 'Back' }} />
          <Stack.Screen name="profile/[userId]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="people" options={{ title: 'Find people', headerBackTitle: 'Back' }} />
          <Stack.Screen name="follow-list" options={{ title: 'Followers', headerBackTitle: 'Back' }} />
          <Stack.Screen name="edit-profile" options={{ title: 'Edit profile', headerBackTitle: 'Back' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && profileGate === 'needs_onboarding'}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {showGate && (
        <View style={[sharedStyles.screen, styles.gate]}>
          {profileGate === 'error' ? (
            <>
              <Text style={TYPE.body}>{profileError}</Text>
              <Pressable
                style={sharedStyles.primaryButton}
                onPress={() => {
                  setProfileGate('loading');
                  checkProfile();
                }}
              >
                <Text style={sharedStyles.primaryButtonText}>Try again</Text>
              </Pressable>
              <Pressable onPress={() => supabase.auth.signOut()}>
                <Text style={sharedStyles.helperText}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={COLORS.accent} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Covers the (empty, fully-guarded) navigator while the profile check runs.
  gate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
});
