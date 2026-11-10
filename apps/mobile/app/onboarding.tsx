// apps/mobile/app/onboarding.tsx
//
// First-run setup for an account with no profiles row (visual spec 4.2). Four steps on one
// screen: (1) name, handle, optional photo; (2) units and weekly goal; (3) equipment; (4) Terms. Nothing is
// written until the final step; createProfile then notifies the root layout, which re-checks and
// swaps this screen for the tabs.
// TODO(stage4): the spec's "content fades out 200 ms, tabs fade in" hand-off is owned by the root
// layout's Stack.Protected swap (animation: fade); only the Welcome toast is added here.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn, SlideInLeft, SlideInRight, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../lib/haptics';
import { COLORS, MOTION, RADII, SPACING, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { createProfile, displayNameError, handleError, isHandleAvailable, normalizeHandle } from '../lib/social/profiles';
import { updateUserSettings } from '../lib/userSettings';
import type { EquipmentTier } from '../lib/equipmentTiers';
import EquipmentTierPicker from '../components/EquipmentTierPicker';
import type { WeightUnit } from '../lib/units';
import { PRIVACY_URL, TERMS_URL } from '../lib/links';
import { signOut } from '../lib/signOut';
import { Button, Card, IconButton, ListGroup, ListRow, PressableScale, ScreenScroll, SegmentedControl, StickyFooter, Stepper, TextField, useToast } from '../components/ui';

const LAST_STEP = 4;

type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

/** One of the three step-indicator segments; the current one fills over 300 ms. */
function Segment({ state }: { state: 'done' | 'current' | 'future' }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(state === 'future' ? 0 : state === 'done' ? 1 : 0);
  useEffect(() => {
    const target = state === 'future' ? 0 : 1;
    fill.value = reduced ? target : withTiming(target, { duration: 300, easing: MOTION.easeOut });
  }, [state, reduced, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, style]} />
    </View>
  );
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [forward, setForward] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [equipmentTier, setEquipmentTier] = useState<EquipmentTier | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
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

  function go(to: number) {
    setForward(to > step);
    setStep(to);
  }

  function next() {
    if (step === 1 && step1Problem()) return;
    go(Math.min(LAST_STEP, step + 1));
  }

  async function finish() {
    if (savingRef.current || !agreed) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateUserSettings({ weightUnit: unit, weeklyGoal, equipmentTier });
      await createProfile({ handle: normalized, displayName, avatarUri, termsAccepted: true });
      // The root layout re-checks the profile and replaces this screen.
      haptics.success();
      toast.show({ message: `Welcome, ${displayName.trim()}.`, tone: 'success' });
    } catch (err: any) {
      toast.show({
        message: err?.message ?? 'Could not finish setting up.',
        tone: 'danger',
        action: { label: 'Retry', onPress: () => void finish() },
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const handleError_ = formatProblem ?? (handleState === 'taken' ? 'Taken' : undefined);
  const handleHelper = handleError_
    ? undefined
    : handleState === 'available'
    ? 'Available'
    : handleState === 'error'
    ? "Couldn't check availability"
    : handleState === 'checking'
    ? 'Checking…'
    : '3–20 letters, numbers or _';
  const handleStatus =
    handleState === 'checking' ? (
      <ActivityIndicator size="small" color={COLORS.textTertiary} />
    ) : handleState === 'available' ? (
      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
    ) : handleState === 'taken' ? (
      <Ionicons name="close-circle" size={20} color={COLORS.danger} />
    ) : undefined;

  const entering = reduced ? FadeIn.duration(150) : (forward ? SlideInRight : SlideInLeft).duration(280).easing(MOTION.easeOut);
  const canContinue = step === 1 ? step1Problem() === null : step === 3 ? equipmentTier !== null : true;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.indicator, { paddingTop: insets.top + SPACING.md }]} accessibilityLabel={`Step ${step} of ${LAST_STEP}`}>
        {Array.from({ length: LAST_STEP }, (_, i) => i + 1).map((n) => (
          <Segment key={n} state={n < step ? 'done' : n === step ? 'current' : 'future'} />
        ))}
      </View>

      <ScreenScroll keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Animated.View key={step} entering={entering} style={styles.step}>
          {step === 1 && (
            <>
              <Text style={TYPE.title1}>Set up your profile</Text>
              <View style={styles.photo}>
                <Avatar path={null} name={displayName || '?'} size="xl" localUri={avatarUri} />
                <IconButton icon="camera" variant="accent" size="sm" accessibilityLabel="Add a photo" onPress={pickPhoto} style={styles.camera} />
              </View>
              <TextField label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" maxLength={40} />
              <TextField
                label="Handle"
                value={handle}
                onChangeText={setHandle}
                placeholder="yourhandle"
                leftIcon="at"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={21}
                helper={handleHelper}
                error={handleError_}
                right={handleStatus}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={TYPE.title1}>How you train</Text>
              <View style={styles.block}>
                <Text style={TYPE.overline}>Units</Text>
                <SegmentedControl
                  options={[
                    { value: 'kg', label: 'kg' },
                    { value: 'lbs', label: 'lbs' },
                  ]}
                  value={unit}
                  onChange={(u) => setUnit(u as WeightUnit)}
                />
              </View>
              <View style={styles.block}>
                <Text style={TYPE.overline}>Weekly goal</Text>
                <Stepper value={weeklyGoal} min={1} max={14} onChange={setWeeklyGoal} />
                <Text style={[TYPE.footnote, styles.center]}>Workouts per week to keep your streak alive.</Text>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={TYPE.title1}>What do you have to train with?</Text>
              <Text style={TYPE.footnote}>Sprint routines only use exercises you can do with this.</Text>
              <EquipmentTierPicker value={equipmentTier} onSelect={setEquipmentTier} />
            </>
          )}

          {step === 4 && (
            <>
              <Text style={TYPE.title1}>One last thing</Text>
              <Card>
                {[
                  { icon: 'shield-checkmark-outline' as const, text: 'Zero tolerance for abusive content.' },
                  { icon: 'medkit-outline' as const, text: 'Not medical advice — stop if something hurts.' },
                  { icon: 'people-outline' as const, text: 'Your workouts are private unless you share them.' },
                ].map((b) => (
                  <View key={b.text} style={styles.bullet}>
                    <Ionicons name={b.icon} size={22} color={COLORS.accent} />
                    <Text style={[TYPE.body, styles.bulletText]}>{b.text}</Text>
                  </View>
                ))}
              </Card>
              <ListGroup>
                <ListRow title="Terms of Use" trailing="chevron" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => undefined)} />
                <ListRow title="Privacy Policy" trailing="chevron" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => undefined)} />
              </ListGroup>
              <PressableScale
                style={styles.agreeRow}
                haptic="select"
                scaleTo={0.99}
                onPress={() => setAgreed((a) => !a)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                accessibilityLabel="I agree to the Terms, including zero tolerance for abusive content"
              >
                <View style={[styles.checkbox, agreed ? styles.checkboxOn : null]}>
                  {agreed ? <Ionicons name="checkmark" size={16} color={COLORS.onAccent} /> : null}
                </View>
                <Text style={[TYPE.body, styles.agreeText]}>I agree to the Terms, including zero tolerance for abusive content.</Text>
              </PressableScale>
            </>
          )}
        </Animated.View>

        <Button title="Sign out" variant="ghost" size="sm" style={styles.signOut} onPress={() => signOut().catch(() => undefined)} />
      </ScreenScroll>

      <StickyFooter style={styles.footer}>
        {step > 1 ? <Button title="Back" variant="ghost" size="lg" disabled={saving} onPress={() => go(step - 1)} /> : null}
        <Button
          title={step === LAST_STEP ? 'Agree and start' : 'Continue'}
          size="lg"
          style={styles.cta}
          loading={saving}
          disabled={step === LAST_STEP ? !agreed : !canContinue}
          onPress={step === LAST_STEP ? finish : next}
        />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  indicator: { flexDirection: 'row', gap: 6, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  segment: { flex: 1, height: 4, borderRadius: RADII.pill, backgroundColor: COLORS.elevated, overflow: 'hidden' },
  segmentFill: { height: 4, backgroundColor: COLORS.accent },
  step: { gap: SPACING.lg },
  photo: { alignSelf: 'center' },
  camera: { position: 'absolute', right: -4, bottom: -4 },
  block: { gap: SPACING.md, alignItems: 'stretch' },
  center: { textAlign: 'center' },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  bulletText: { flex: 1 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  agreeText: { flex: 1 },
  signOut: { alignSelf: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  cta: { flex: 1 },
});
