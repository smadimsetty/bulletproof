// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription, the profile gate
// (onboarding vs tabs), push-tap routing and the recommendations-fetch side effect. Also keeps the workout
// Live Activity in sync with the in-progress workout (lib/workoutActivityBridge.ts).
// The `recommendations` fetch below is
// intentionally left in place though nothing renders it: it's the mobile
// side of the old daily-recommendation engine, which stays running
// dormant rather than being torn out.
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';
import { fetchActiveWorkout, subscribeToActiveWorkoutChanges } from '../lib/workouts';
import { syncWorkoutLiveActivity } from '../lib/workoutActivityBridge';
import { fetchMyProfile, subscribeToProfileChanges } from '../lib/social/profiles';
import { ensurePushRegistered } from '../lib/social/push';
import { safePushRoute } from '../lib/social/notificationFormat';
import { signOut } from '../lib/signOut';
import { ToastProvider } from '../components/ui/Toast';
import { COLORS, SPACING } from '../lib/theme';
import { AnimatedBrandMark } from '../components/BrandMark';
import { Button, ErrorState } from '../components/ui';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

type ProfileGate = 'loading' | 'needs_onboarding' | 'ready' | 'error';

// Visual spec section 3 (Header styling): one dark stack header + no white flash.
const STACK_SCREEN_OPTIONS: NonNullable<ComponentProps<typeof Stack>['screenOptions']> = {
  headerStyle: { backgroundColor: COLORS.bg },
  headerShadowVisible: false,
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: COLORS.bg },
};

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

    loadRecommendations();
    refreshLiveActivity();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
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
  }, [session, loadRecommendations, refreshLiveActivity]);

  const showApp = !!session && profileGate === 'ready';

  // Push: refresh the token silently if permission was already granted, and
  // route taps (warm and cold start) to the in-app path in data.url. Only our
  // own known path shapes are ever navigated to.
  const router = useRouter();
  const handledColdStartRef = useRef(false);
  useEffect(() => {
    if (!showApp) return;
    ensurePushRegistered({ ask: false });
    const go = (response: Notifications.NotificationResponse | null) => {
      const route = safePushRoute(response?.notification.request.content.data?.url);
      if (route) router.push(route as any);
    };
    if (!handledColdStartRef.current) {
      handledColdStartRef.current = true;
      go(Notifications.getLastNotificationResponse());
    }
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, [showApp, router]);
  const showGate = !!session && (profileGate === 'loading' || profileGate === 'error');

  return (
    <ToastProvider>
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Protected guard={showApp}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Logger is a full-screen modal: it is minimised with its chevron, never dismissed by gesture (a swipe-down must not leave an unreachable running workout). */}
          <Stack.Screen name="workout/[workoutId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false, headerShown: false }} />
          <Stack.Screen name="workout-summary/[workoutId]" options={{ title: 'Workout', headerBackTitle: 'Back' }} />
          <Stack.Screen name="sprint" options={{ title: 'Sprint', headerBackTitle: 'Back' }} />
          <Stack.Screen name="hang" options={{ title: 'Dead hang', headerBackTitle: 'Back' }} />
          <Stack.Screen name="recap" options={{ title: 'Monthly recap', headerBackTitle: 'Back' }} />
          <Stack.Screen name="exercise/[exerciseId]" options={{ title: 'Exercise', headerBackTitle: 'Back' }} />
          <Stack.Screen name="routines/[routineId]" options={{ presentation: 'modal', title: 'Routine' }} />
          <Stack.Screen name="library/index" options={{ title: 'Exercises', headerBackTitle: 'Back' }} />
          <Stack.Screen name="library/new" options={{ presentation: 'modal', title: 'New exercise' }} />
          <Stack.Screen name="profile/[userId]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="people" options={{ title: 'Find people', headerBackTitle: 'Back' }} />
          <Stack.Screen name="follow-list" options={{ title: 'Followers', headerBackTitle: 'Back' }} />
          <Stack.Screen name="edit-profile" options={{ title: 'Edit profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="comments/[workoutId]" options={{ title: 'Comments', headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', headerBackTitle: 'Back' }} />
          <Stack.Screen name="inbox" options={{ title: 'Inbox', headerBackTitle: 'Back' }} />
          <Stack.Screen name="blocked" options={{ title: 'Blocked users', headerBackTitle: 'Back' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && profileGate === 'needs_onboarding'}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      {showGate && (
        <View style={styles.gate}>
          {profileGate === 'error' ? (
            <>
              <ErrorState
                message={profileError ?? undefined}
                onRetry={() => {
                  setProfileGate('loading');
                  checkProfile();
                }}
              />
              <Button title="Sign out" variant="ghost" onPress={() => signOut().catch(() => supabase.auth.signOut())} />
            </>
          ) : (
            <AnimatedBrandMark size={96} />
          )}
        </View>
      )}
    </View>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  // Covers the (empty, fully-guarded) navigator while the profile check runs.
  gate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
});
