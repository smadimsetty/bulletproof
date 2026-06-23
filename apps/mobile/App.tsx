import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { syncHealthKitWorkouts } from './lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from './lib/recommendations';
import { labelForSessionType } from './lib/sessionTypeLabels';

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('not signed in');
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

  useEffect(() => {
    if (!session) {
      // No authenticated session yet: skip HealthKit and the recommendations
      // fetch entirely. HealthKit shouldn't burn its one-shot iOS permission
      // prompt before the user has signed in and RLS would actually allow
      // the upsert to persist; the recommendations fetch has nothing useful
      // to show before sign-in either, since recommendations_public still
      // requires an authenticated (or anon) request through this same
      // client.
      return;
    }

    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });
    loadRecommendations();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
        loadRecommendations();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session, loadRecommendations]);

  async function handleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (err: any) {
      setStatus(`sign-in error: ${err.message}`);
    }
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text>{status}</Text>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={styles.button}
          onPress={handleSignIn}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      {recommendations.loading && <Text>Loading today's recommendation...</Text>}

      {recommendations.error && (
        <Text style={styles.error}>Couldn't load recommendations: {recommendations.error}</Text>
      )}

      {!recommendations.loading && !recommendations.error && (
        <>
          {recommendations.yesterday && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Yesterday</Text>
              <Text style={styles.headline}>
                {labelForSessionType(recommendations.yesterday.top_pick)}
              </Text>
              <Text style={styles.rationale}>{recommendations.yesterday.public_rationale}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Today</Text>
            {recommendations.today ? (
              <>
                <Text style={styles.headline}>
                  {labelForSessionType(recommendations.today.top_pick)}
                </Text>
                {recommendations.today.runner_up && (
                  <Text style={styles.runnerUp}>
                    Runner-up: {labelForSessionType(recommendations.today.runner_up)}
                  </Text>
                )}
                <Text style={styles.rationale}>{recommendations.today.public_rationale}</Text>
              </>
            ) : (
              <Text style={styles.rationale}>
                Today's recommendation hasn't generated yet -- check back this morning.
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  button: { width: 200, height: 44 },
  card: { gap: 6, padding: 16, borderRadius: 8, backgroundColor: '#F2F2F7' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#6E6E73', textTransform: 'uppercase' },
  headline: { fontSize: 24, fontWeight: '700' },
  runnerUp: { fontSize: 15, color: '#3A3A3C' },
  rationale: { fontSize: 15, color: '#3A3A3C', marginTop: 4 },
  error: { fontSize: 14, color: '#B00020' },
});
