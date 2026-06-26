// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription and the
// HealthKit-sync/recommendations-fetch side effects App.tsx used to own,
// then gates its children with Stack.Protected based on session presence
// -- the current documented Expo Router auth pattern (see
// docs/superpowers/specs/2026-06-24-mobile-nav-design.md Decision 1/2).
//
// The recommendations state fetched here isn't rendered by anything yet
// -- app/(tabs)/index.tsx is a placeholder until Phase 5 -- but the fetch
// itself (and the HealthKit sync trigger) must keep firing on sign-in and
// on app-foreground exactly as it did in App.tsx, so the side effects are
// migrated verbatim rather than dropped.
//
// Phase 6: adds the global persistent active-session banner (sessions.
// started_at/ended_at) as a sibling to the Stack, fetched on the same
// sign-in/foreground triggers as the existing HealthKit/recommendations
// effects -- not a new useEffect, the same one extended with one more
// fetch, per docs/superpowers/specs/2026-06-24-logger-design.md
// Decision 7.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isHealthKitSyncEnabled, syncHealthKitWorkouts, syncHealthKitDailyMetrics } from '../lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';
import { fetchActiveSession } from '../lib/sessionLifecycle';
import type { ActiveSessionRow } from '../lib/sessionLifecycle';
import ActiveSessionBanner from '../components/ActiveSessionBanner';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
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
  const [activeSession, setActiveSession] = useState<ActiveSessionRow | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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

  const loadActiveSession = useCallback(async () => {
    try {
      const result = await fetchActiveSession();
      setActiveSession(result);
    } catch (err) {
      console.warn('Active session fetch failed:', err);
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

  useEffect(() => {
    if (!session) {
      // No authenticated session yet: skip HealthKit, the recommendations
      // fetch, and the active-session fetch entirely. HealthKit shouldn't
      // burn its one-shot iOS permission prompt before the user has
      // signed in and RLS would actually allow the upsert to persist; the
      // recommendations and active-session fetches have nothing useful to
      // show before sign-in either, since both still require an
      // authenticated (or anon) request through this same client.
      return;
    }

    runHealthKitSyncIfEnabled('launch');
    loadRecommendations();
    loadActiveSession();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        runHealthKitSyncIfEnabled('foreground');
        loadRecommendations();
        loadActiveSession();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session, loadRecommendations, loadActiveSession, runHealthKitSyncIfEnabled]);

  return (
    <>
      {activeSession && <ActiveSessionBanner session={activeSession} />}
      <Stack>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="logger/[blockId]"
            options={{ presentation: 'modal', title: 'Log session' }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
