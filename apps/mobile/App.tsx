import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { syncHealthKitWorkouts } from './lib/healthkitSync';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('not signed in');
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

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

  return (
    <View style={styles.container}>
      <Text>{session ? `Signed in as ${session.user.id}` : status}</Text>
      {!session && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={styles.button}
          onPress={handleSignIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 200, height: 44 },
});
