// apps/mobile/app/sign-in.tsx
//
// The signed-out screen, rendered by app/_layout.tsx's Stack.Protected guard
// when there is no Supabase session. Two ways in: Sign in with Apple, or an
// email + 6-digit one-time code (signInWithOtp / verifyOtp -- a code rather
// than a magic link so there is no deep-link round trip).
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';

const RESEND_SECONDS = 30;

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Synchronous guard: two taps can land before `busy` re-renders.
  const busyRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleAppleSignIn() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned from Apple');
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (authError) throw authError;
    } catch (err: any) {
      // The user dismissing the Apple sheet is not an error worth showing.
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      setError(err?.message ?? 'Sign-in failed.');
    }
  }

  async function sendCode() {
    if (busyRef.current) return;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (otpError) throw otpError;
      setMode('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send the code.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busyRef.current) return;
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      if (verifyError) throw verifyError;
      // The session listener in the root layout takes it from here.
    } catch (err: any) {
      setError(err?.message ?? 'That code did not work. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={TYPE.screenTitle}>Bulletproof</Text>
        {error && <Text style={sharedStyles.warningText}>{error}</Text>}

        {mode === 'choose' && (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={5}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
            <Pressable style={styles.emailButton} onPress={() => { setError(null); setMode('email'); }}>
              <Text style={styles.emailButtonText}>Continue with email</Text>
            </Pressable>
          </>
        )}

        {mode === 'email' && (
          <View style={styles.form}>
            <TextInput
              style={sharedStyles.textInput}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoFocus
            />
            <Pressable style={[sharedStyles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={sendCode}>
              <Text style={sharedStyles.primaryButtonText}>{busy ? 'Sending…' : 'Email me a code'}</Text>
            </Pressable>
            <Pressable onPress={() => { setError(null); setMode('choose'); }} style={styles.textBtn}>
              <Text style={styles.link}>Back</Text>
            </Pressable>
          </View>
        )}

        {mode === 'code' && (
          <View style={styles.form}>
            <Text style={TYPE.body}>We sent a 6-digit code to {email.trim()}.</Text>
            <TextInput
              style={[sharedStyles.textInput, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
            />
            <Pressable style={[sharedStyles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={verifyCode}>
              <Text style={sharedStyles.primaryButtonText}>{busy ? 'Checking…' : 'Verify and sign in'}</Text>
            </Pressable>
            <Pressable disabled={busy || cooldown > 0} onPress={sendCode} style={styles.textBtn}>
              <Text style={[styles.link, (busy || cooldown > 0) && styles.disabled]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setError(null); setMode('email'); }} style={styles.textBtn}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </View>
        )}

        <Text style={[sharedStyles.helperText, styles.note]}>
          Use the same sign-in method each time — Apple and email create separate accounts unless the emails match.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.lg },
  appleButton: { width: 240, height: 44 },
  emailButton: {
    width: 240,
    height: 44,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailButtonText: { ...TYPE.label, fontWeight: '600' },
  form: { width: '100%', gap: SPACING.sm },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  textBtn: { alignItems: 'center', paddingVertical: SPACING.xs },
  link: { color: COLORS.accent, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  note: { textAlign: 'center', marginTop: SPACING.md },
});
