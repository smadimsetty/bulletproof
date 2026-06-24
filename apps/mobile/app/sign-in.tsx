// apps/mobile/app/sign-in.tsx
//
// The signed-out screen. Rendered by app/_layout.tsx's Stack.Protected
// guard when there is no Supabase session. This is App.tsx's original
// not-signed-in JSX and handleSignIn handler, moved verbatim -- see
// docs/superpowers/specs/2026-06-24-mobile-nav-design.md Decision 2.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';

export default function SignIn() {
  const [status, setStatus] = useState('not signed in');

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

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 200, height: 44 },
});
