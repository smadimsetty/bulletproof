// apps/mobile/app/edit-profile.tsx
//
// Edit display name, handle, bio and photo. Handle changes re-check
// availability live (debounced); the word filter's rejection message from the
// server is shown as-is.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import {
  displayNameError, fetchMyProfile, handleError, isHandleAvailable, normalizeHandle, updateProfile, type Profile,
} from '../lib/social/profiles';

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
      router.back();
    } catch (err: any) {
      setSaveError(err?.message ?? 'Could not save your profile.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Edit profile' }} />
        <Text style={TYPE.body}>{loadError}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.dim]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Edit profile' }} />
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Edit profile' }} />
      <ScrollView contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
        <View style={sharedStyles.card}>
          <Pressable onPress={pickPhoto} style={styles.photoRow}>
            <Avatar path={profile.avatarPath} name={displayName || profile.displayName} size={72} localUri={avatarUri} />
            <Text style={styles.link}>Change photo</Text>
          </Pressable>
          <Text style={sharedStyles.helperText}>Display name</Text>
          <TextInput style={sharedStyles.textInput} value={displayName} onChangeText={setDisplayName} maxLength={40} />
          <Text style={sharedStyles.helperText}>Handle</Text>
          <TextInput
            style={sharedStyles.textInput}
            value={handle}
            onChangeText={setHandle}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
          />
          <Text style={[sharedStyles.helperText, (formatProblem || handleState === 'taken') && sharedStyles.warningText]}>
            {formatProblem && normalized.length > 0
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
          <Text style={sharedStyles.helperText}>Bio ({bio.length}/160)</Text>
          <TextInput
            style={[sharedStyles.textInput, styles.bio]}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={160}
            placeholder="A line about you (optional)"
            placeholderTextColor={COLORS.muted}
          />
        </View>
        {saveError && <Text style={sharedStyles.warningText}>{saveError}</Text>}
        <Pressable style={[sharedStyles.primaryButton, saving && styles.dim]} disabled={saving} onPress={save}>
          <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  link: { color: COLORS.accent, fontWeight: '600', fontSize: 15 },
  bio: { minHeight: 80, textAlignVertical: 'top' },
});
