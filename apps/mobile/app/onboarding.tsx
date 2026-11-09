// apps/mobile/app/onboarding.tsx
//
// First-run setup for an account with no profiles row (brand-new users, and
// Sohan once). Three steps on one screen: (1) name, handle, optional photo;
// (2) units and weekly goal; (3) Terms. Nothing is written until the final
// step; createProfile then notifies the root layout, which re-checks and
// swaps this screen for the tabs.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { createProfile, displayNameError, handleError, isHandleAvailable, normalizeHandle } from '../lib/social/profiles';
import { updateUserSettings } from '../lib/userSettings';
import type { WeightUnit } from '../lib/units';
import { PRIVACY_URL, TERMS_URL } from '../lib/links';
import { signOut } from '../lib/signOut';

type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const normalized = normalizeHandle(handle);
  const formatProblem = normalized.length > 0 ? handleError(normalized) : null;

  // Debounced live availability check; a stale answer for an old handle is dropped.
  useEffect(() => {
    if (normalized.length === 0 || handleError(normalized)) {
      setHandleState('idle');
      return;
    }
    setHandleState('checking');
    let live = true;
    const t = setTimeout(() => {
      isHandleAvailable(normalized)
        .then((ok) => live && setHandleState(ok ? 'available' : 'taken'))
        .catch(() => live && setHandleState('error'));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [normalized]);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!res.canceled && res.assets[0]) setAvatarUri(res.assets[0].uri);
  }

  function step1Problem(): string | null {
    const nameProblem = displayNameError(displayName);
    if (nameProblem) return nameProblem;
    if (normalized.length === 0) return 'Choose a handle.';
    if (formatProblem) return formatProblem;
    if (handleState === 'taken') return 'That handle is taken.';
    if (handleState === 'checking') return 'Checking that handle…';
    if (handleState === 'error') return "Couldn't check that handle. Check your connection.";
    return null;
  }

  function next() {
    setError(null);
    if (step === 1) {
      const problem = step1Problem();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function finish() {
    if (savingRef.current) return;
    if (!agreed) {
      setError('Please agree to the Terms to continue.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await updateUserSettings({ weightUnit: unit, weeklyGoal });
      await createProfile({ handle: normalized, displayName, avatarUri, termsAccepted: true });
      // The root layout re-checks the profile and replaces this screen.
    } catch (err: any) {
      setError(err?.message ?? 'Could not finish setting up.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
        <View style={styles.dots}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.dot, n <= step && styles.dotActive]} />
          ))}
        </View>
        <Text style={sharedStyles.helperText}>Step {step} of 3</Text>

        {step === 1 && (
          <View style={sharedStyles.card}>
            <Text style={TYPE.screenTitle}>Set up your profile</Text>
            <Pressable onPress={pickPhoto} style={styles.photoRow}>
              <Avatar path={null} name={displayName || '?'} size={64} localUri={avatarUri} />
              <Text style={styles.link}>{avatarUri ? 'Change photo' : 'Add a photo (optional)'}</Text>
            </Pressable>
            <Text style={sharedStyles.helperText}>Display name</Text>
            <TextInput
              style={sharedStyles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={COLORS.muted}
              maxLength={40}
            />
            <Text style={sharedStyles.helperText}>Handle</Text>
            <TextInput
              style={sharedStyles.textInput}
              value={handle}
              onChangeText={setHandle}
              placeholder="@yourhandle"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={21}
            />
            <Text
              style={[
                sharedStyles.helperText,
                (formatProblem || handleState === 'taken') && sharedStyles.warningText,
                handleState === 'available' && styles.ok,
              ]}
            >
              {formatProblem
                ? formatProblem
                : handleState === 'checking'
                ? 'Checking…'
                : handleState === 'available'
                ? 'Available'
                : handleState === 'taken'
                ? 'That handle is taken'
                : handleState === 'error'
                ? "Couldn't check availability"
                : '3–20 letters, numbers or _'}
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={sharedStyles.card}>
            <Text style={TYPE.screenTitle}>Your training</Text>
            <Text style={TYPE.sectionTitle}>Weight units</Text>
            <View style={styles.row}>
              {(['lbs', 'kg'] as const).map((u) => (
                <Pressable key={u} style={[styles.chip, unit === u && styles.chipActive]} onPress={() => setUnit(u)}>
                  <Text style={unit === u ? styles.chipTextActive : styles.chipText}>{u}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={TYPE.sectionTitle}>Weekly goal</Text>
            <Text style={sharedStyles.helperText}>Workouts per week. Your streak counts weeks you hit it.</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.stepBtn} onPress={() => setWeeklyGoal((g) => Math.max(1, g - 1))} accessibilityLabel="Decrease goal">
                <Ionicons name="remove" size={22} color={COLORS.accent} />
              </Pressable>
              <Text style={styles.goalValue}>{weeklyGoal}</Text>
              <Pressable style={styles.stepBtn} onPress={() => setWeeklyGoal((g) => Math.min(14, g + 1))} accessibilityLabel="Increase goal">
                <Ionicons name="add" size={22} color={COLORS.accent} />
              </Pressable>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={sharedStyles.card}>
            <Text style={TYPE.screenTitle}>Terms</Text>
            <Text style={TYPE.body}>
              Bulletproof is a mobility-first workout logger with an optional social layer. You choose who sees each
              workout. We have zero tolerance for objectionable content or abusive behavior, and accounts that post it
              are removed. Mobility suggestions are general information, not medical advice.
            </Text>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
              <Text style={styles.link}>Read the Terms of Use</Text>
            </Pressable>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
              <Text style={styles.link}>Read the Privacy Policy</Text>
            </Pressable>
            <Pressable style={styles.agreeRow} onPress={() => setAgreed((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
              <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={26} color={COLORS.accent} />
              <Text style={[TYPE.body, styles.agreeText]}>
                I agree to the Terms, including zero tolerance for abusive content
              </Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={sharedStyles.warningText}>{error}</Text>}

        {step < 3 ? (
          <Pressable style={sharedStyles.primaryButton} onPress={next}>
            <Text style={sharedStyles.primaryButtonText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable style={[sharedStyles.primaryButton, (saving || !agreed) && styles.disabled]} disabled={saving} onPress={finish}>
            <Text style={sharedStyles.primaryButtonText}>{saving ? 'Setting up…' : 'Create profile'}</Text>
          </Pressable>
        )}
        {step > 1 && (
          <Pressable style={styles.textBtn} disabled={saving} onPress={() => { setError(null); setStep((s) => s - 1); }}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
        )}
        <Pressable style={styles.textBtn} onPress={() => signOut().catch(() => undefined)}>
          <Text style={sharedStyles.helperText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: SPACING.sm },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accent },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  link: { color: COLORS.accent, fontWeight: '600', fontSize: 15 },
  ok: { color: COLORS.accent },
  row: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.ink },
  chipTextActive: { color: COLORS.card, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalValue: { fontSize: 28, fontWeight: '700', color: COLORS.ink, minWidth: 40, textAlign: 'center' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  agreeText: { flex: 1 },
  textBtn: { alignItems: 'center', paddingVertical: SPACING.xs },
  disabled: { opacity: 0.5 },
});
