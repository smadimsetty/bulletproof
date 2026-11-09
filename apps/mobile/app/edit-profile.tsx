// apps/mobile/app/edit-profile.tsx
//
// Edit display name, handle, bio and photo (visual spec 4.18). Handle changes re-check
// availability live (debounced); the word filter's rejection message from the server is shown
// as-is.
// TODO(stage4): spec presents this as a tall Sheet; Settings and the Profile tab both push the
// /edit-profile route, so it stays a screen restyled with the same fields.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as haptics from '../lib/haptics';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import {
  displayNameError, fetchMyProfile, handleError, isHandleAvailable, normalizeHandle, updateProfile, type Profile,
} from '../lib/social/profiles';
import { Button, ErrorState, IconButton, ScreenScroll, SkeletonCard, StickyFooter, TextField } from '../components/ui';

type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export default function EditProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      if (!p) throw new Error('No profile found.');
      setProfile(p);
      setDisplayName(p.displayName);
      setHandle(p.handle);
      setBio(p.bio ?? '');
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load your profile.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const normalized = normalizeHandle(handle);
  const changedHandle = !!profile && normalized !== profile.handle;
  const formatProblem = normalized.length > 0 ? handleError(normalized) : 'Choose a handle.';

  useEffect(() => {
    if (!changedHandle || handleError(normalized)) {
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
  }, [normalized, changedHandle]);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!res.canceled && res.assets[0]) setAvatarUri(res.assets[0].uri);
  }

  async function save() {
    if (!profile || savingRef.current) return;
    const problem =
      displayNameError(displayName) ??
      formatProblem ??
      (changedHandle && handleState === 'taken' ? 'That handle is taken.' : null) ??
      (bio.length > 160 ? 'Keep your bio to 160 characters or fewer.' : null);
    if (problem) {
      haptics.error();
      setSaveError(problem);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile(
        {
          displayName,
          handle: changedHandle ? normalized : undefined,
          bio,
          avatarUri,
        },
        profile.avatarPath
      );
      haptics.success();
      router.back();
    } catch (err: any) {
      haptics.error();
      setSaveError(err?.message ?? 'Could not save your profile.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Edit profile' }} />
        <ScreenScroll>
          <ErrorState
            message={loadError}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load();
              setRetrying(false);
            }}
          />
        </ScreenScroll>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Edit profile' }} />
        <ScreenScroll>
          <SkeletonCard />
          <SkeletonCard />
        </ScreenScroll>
      </View>
    );
  }

  const handleProblem = formatProblem && normalized.length > 0 ? formatProblem : handleState === 'taken' ? 'That handle is taken' : undefined;
  const handleHelper =
    handleProblem
      ? undefined
      : handleState === 'checking'
      ? 'Checking…'
      : handleState === 'available'
      ? 'Available'
      : handleState === 'error'
      ? "Couldn't check availability"
      : '3–20 letters, numbers or _';
  const handleStatus =
    handleState === 'checking' ? (
      <ActivityIndicator size="small" color={COLORS.textTertiary} />
    ) : handleState === 'available' ? (
      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
    ) : handleState === 'taken' ? (
      <Ionicons name="close-circle" size={20} color={COLORS.danger} />
    ) : undefined;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Edit profile' }} />
      <ScreenScroll keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.photo}>
          <Avatar path={profile.avatarPath} name={displayName || profile.displayName} size="xl" localUri={avatarUri} />
          <IconButton icon="camera" variant="accent" size="sm" accessibilityLabel="Change photo" onPress={pickPhoto} style={styles.camera} />
        </View>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
        <TextField
          label="Handle"
          value={handle}
          onChangeText={setHandle}
          leftIcon="at"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={21}
          helper={handleHelper}
          error={handleProblem}
          right={handleStatus}
        />
        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={160}
          showCount
          placeholder="A line about you (optional)"
        />
        {saveError ? <Text style={[TYPE.footnote, { color: COLORS.danger }]}>{saveError}</Text> : null}
      </ScreenScroll>
      <StickyFooter>
        <Button title="Save" size="lg" fullWidth loading={saving} onPress={save} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  photo: { alignSelf: 'center', marginBottom: SPACING.sm },
  camera: { position: 'absolute', right: -4, bottom: -4 },
});
