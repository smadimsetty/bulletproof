// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription and the
// HealthKit-sync/recommendations-fetch side effects. The active-session
// banner and its Logger-only wiring were removed with the mobility sprint
// pivot (Logger no longer exists) -- see
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// section 1's disposition table. The `recommendations` fetch below is
// intentionally left in place though nothing renders it: it's the mobile
// side of the old daily-recommendation engine, which stays running
// dormant per that same table rather than being torn out.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isHealthKitSyncEnabled, syncHealthKitWorkouts, syncHealthKitDailyMetrics } from '../lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';

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
      return;
    }

    runHealthKitSyncIfEnabled('launch');
    loadRecommendations();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        runHealthKitSyncIfEnabled('foreground');
        loadRecommendations();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session, loadRecommendations, runHealthKitSyncIfEnabled]);

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
