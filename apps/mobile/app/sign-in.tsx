// apps/mobile/app/sign-in.tsx
//
// The signed-out screen (visual spec 4.1), rendered by app/_layout.tsx's Stack.Protected guard
// when there is no Supabase session. Two ways in: Sign in with Apple, or an email + 6-digit
// one-time code (signInWithOtp / verifyOtp -- a code rather than a magic link so there is no
// deep-link round trip).
// TODO(stage4): spec's success transition (mark scales 1 -> 1.1 and fades) isn't built: the
// root layout swaps this screen the instant the session lands, so there is no beat to animate.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as haptics from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { COLORS, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../lib/theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/links';
import { AnimatedBrandMark } from '../components/BrandMark';
import { Button, IconButton, TextField } from '../components/ui';

const RESEND_SECONDS = 30;

function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Synchronous guard: two taps can land before `busy` re-renders.
  const busyRef = useRef(false);
  const codeInput = useRef<TextInput>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function fail(message: string) {
    haptics.error();
    setError(message);
  }

  function shakeCells() {
    if (reduced) return;
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 70 })
    );
  }

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
      // Store a revocable Apple refresh token server-side, so deleting the
      // account can revoke it (App Store 5.1.1(v)). Best effort, never blocks.
      if (credential.authorizationCode) {
        supabase.functions
          .invoke('apple-token-exchange', { body: { authorizationCode: credential.authorizationCode } })
          .catch((e) => console.warn('Apple token exchange failed:', e));
      }
    } catch (err: any) {
      // The user dismissing the Apple sheet is not an error worth showing.
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      fail(err?.message ?? 'Sign-in failed.');
    }
  }

  async function sendCode() {
    if (busyRef.current) return;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      fail('Enter a valid email address.');
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
      fail(err?.message ?? 'Could not send the code.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function verifyCode(value: string) {
    if (busyRef.current) return;
    const token = value.trim();
    if (!/^\d{6}$/.test(token)) {
      fail('Enter the 6-digit code from your email.');
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
      fail(err?.message ?? 'That code did not work. Try again.');
      shakeCells();
      setCode('');
      codeInput.current?.focus();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onCodeChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === 6) void verifyCode(digits);
  }

  const goBack = () => {
    setError(null);
    setMode(mode === 'code' ? 'email' : 'choose');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.lg }]}>
        {mode !== 'choose' ? (
          <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} style={[styles.back, { top: insets.top + SPACING.xs }]} />
        ) : null}

        <View style={styles.hero}>
          <AnimatedBrandMark size={96} />
          <Text style={styles.wordmark}>MOVEMAXX</Text>
          <Text style={[TYPE.body, styles.tagline]}>Mobility that sticks.{'\n'}Fix one pain point in 14 days.</Text>
        </View>

        <Animated.View key={mode} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.panel}>
          {mode === 'choose' && (
            <>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={RADII.md}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
              <Button title="Continue with email" icon="mail-outline" variant="secondary" size="lg" fullWidth onPress={() => { setError(null); setMode('email'); }} />
              {error ? <Text style={[TYPE.footnote, styles.error]}>{error}</Text> : null}
              <Text style={[TYPE.footnote, styles.note]}>Use the same sign-in method each time.</Text>
            </>
          )}

          {mode === 'email' && (
            <>
              <TextField
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoFocus
                error={error ?? undefined}
              />
              <Button title="Send code" size="lg" fullWidth loading={busy} onPress={sendCode} />
            </>
          )}

          {mode === 'code' && (
            <>
              <Text style={[TYPE.body, styles.codeHelp]}>Enter the 6-digit code sent to {email.trim()}</Text>
              <Animated.View style={shakeStyle}>
                <Pressable style={styles.cells} onPress={() => codeInput.current?.focus()} accessibilityLabel="Verification code">
                  {Array.from({ length: 6 }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.cell, i === Math.min(code.length, 5) && !busy ? styles.cellActive : null, error ? styles.cellError : null]}
                    >
                      <Text style={TYPE.stat} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>{code[i] ?? ''}</Text>
                    </View>
                  ))}
                  <TextInput
                    ref={codeInput}
                    value={code}
                    onChangeText={onCodeChange}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    keyboardAppearance="dark"
                    maxLength={6}
                    autoFocus
                    caretHidden
                    editable={!busy}
                    style={styles.hiddenInput}
                  />
                </Pressable>
              </Animated.View>
              {error ? <Text style={[TYPE.footnote, styles.error]}>{error}</Text> : null}
              <Button
                title={cooldown > 0 ? `Resend in ${mmss(cooldown)}` : 'Resend code'}
                variant="ghost"
                disabled={busy || cooldown > 0}
                onPress={sendCode}
              />
            </>
          )}
        </Animated.View>

        <View style={styles.legal}>
          <Button title="Terms" variant="ghost" size="sm" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => undefined)} />
          <Text style={TYPE.caption}>·</Text>
          <Button title="Privacy" variant="ghost" size="sm" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => undefined)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: SPACING.lg },
  back: { position: 'absolute', left: SPACING.sm, zIndex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  wordmark: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  tagline: { color: COLORS.textSecondary, textAlign: 'center' },
  panel: { gap: SPACING.md },
  appleButton: { height: 56, alignSelf: 'stretch' },
  note: { textAlign: 'center' },
  error: { color: COLORS.danger, textAlign: 'center' },
  codeHelp: { color: COLORS.textSecondary, textAlign: 'center' },
  cells: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm },
  cell: {
    width: 48,
    minHeight: 56,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: COLORS.accent },
  cellError: { borderColor: COLORS.danger },
  hiddenInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02 },
  legal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
});
