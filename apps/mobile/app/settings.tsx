// apps/mobile/app/settings.tsx
//
// Settings (reached from the Profile tab's gear): profile, units, weekly
// goal, default post visibility, public/private profile, blocked users,
// notification toggles, Apple Health write, legal links, account (sign out,
// delete). The old training-engine fields (split, pains, diet, location...)
// are no longer shown; their data stays in user_profile untouched.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/signOut';
import { DEFAULT_SETTINGS, fetchUserSettings, updateUserSettings, type UserSettings, type Visibility } from '../lib/userSettings';
import { fetchMyProfile, updateProfile, type Profile } from '../lib/social/profiles';
import { requestHealthWriteAccess } from '../lib/healthkitWrite';
import { accountLabel, canConfirmDelete } from '../lib/settingsFormat';
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../lib/links';
import type { WeightUnit } from '../lib/units';
import Avatar from '../components/social/Avatar';
import VisibilityPicker from '../components/social/VisibilityPicker';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState('Signed in');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  // Settings writes are serialized so a quick second tap can't race the first.
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [s, p, sessionRes] = await Promise.all([
        fetchUserSettings(),
        fetchMyProfile(),
        supabase.auth.getSession(),
      ]);
      const user = sessionRes.data.session?.user;
      setSettings(s);
      setProfile(p);
      setAccount(accountLabel(user?.app_metadata?.provider as string | undefined, user?.email ?? undefined));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Optimistic settings save with rollback and a visible error. */
  async function saveSettings(patch: Partial<UserSettings>): Promise<boolean> {
    if (savingRef.current) return false;
    savingRef.current = true;
    const before = settings;
    setSettings({ ...settings, ...patch });
    setSaveError(null);
    try {
      setSettings(await updateUserSettings(patch));
      return true;
    } catch (err: any) {
      setSettings(before);
      setSaveError(err?.message ?? 'Could not save that change.');
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function setPublic(next: boolean) {
    if (!profile || savingRef.current) return;
    const apply = async () => {
      savingRef.current = true;
      setSaveError(null);
      try {
        await updateProfile({ isPublic: next });
        setProfile({ ...profile, isPublic: next });
        // A Public default makes no sense for a private profile.
        if (!next && settings.defaultVisibility === 'public') {
          savingRef.current = false;
          await saveSettings({ defaultVisibility: 'followers' });
        }
      } catch (err: any) {
        setSaveError(err?.message ?? 'Could not update your profile.');
      } finally {
        savingRef.current = false;
      }
    };
    if (!next) {
      Alert.alert('Make your profile private?', 'Only approved followers will see your workouts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make private', onPress: apply },
      ]);
    } else {
      await apply();
    }
  }

  async function toggleHealth(next: boolean) {
    if (next) {
      const ok = await requestHealthWriteAccess();
      if (!ok) {
        Alert.alert('Apple Health', 'Bulletproof needs permission to save workouts. You can allow it in the Health app under Sharing.');
        return;
      }
    }
    await saveSettings({ healthkitWriteEnabled: next });
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          signOut().catch((err) => Alert.alert('Error', err?.message ?? 'Could not sign out.')),
      },
    ]);
  }

  function startDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, workouts, photos, routines and everything else tied to your account. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeleteText('');
            setDeleteError(null);
            setDeleteOpen(true);
          },
        },
      ]
    );
  }

  async function confirmDelete() {
    if (deletingRef.current || !canConfirmDelete(deleteText)) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw new Error(error.message);
      setDeleteOpen(false);
      // The auth user is gone server-side; just clear the local session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Could not delete your account. Nothing was changed — try again.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const openUrl = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Settings' }} />
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Settings' }} />
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

  const switchRow = (label: string, value: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={TYPE.body}>{label}</Text>
        {!!hint && <Text style={sharedStyles.helperText}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.accent }} />
    </View>
  );

  const linkRow = (label: string, onPress: () => void, icon: keyof typeof Ionicons.glyphMap = 'chevron-forward') => (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Text style={TYPE.body}>{label}</Text>
      <Ionicons name={icon} size={18} color={COLORS.muted} />
    </Pressable>
  );

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Stack.Screen options={{ title: 'Settings' }} />

      {saveError && (
        <View style={[sharedStyles.card, styles.errorCard]}>
          <Text style={[sharedStyles.warningText, styles.flex]}>Couldn't save: {saveError}</Text>
          <Pressable onPress={() => setSaveError(null)}>
            <Text style={styles.link}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      {profile && (
        <Pressable style={[sharedStyles.card, styles.profileRow]} onPress={() => router.push('/edit-profile')}>
          <Avatar path={profile.avatarPath} name={profile.displayName} size={52} />
          <View style={styles.flex}>
            <Text style={TYPE.sectionTitle}>{profile.displayName}</Text>
            <Text style={sharedStyles.helperText}>@{profile.handle}</Text>
          </View>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      )}

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>Training</Text>
        <Text style={sharedStyles.helperText}>Weight units</Text>
        <View style={styles.chipRow}>
          {(['lbs', 'kg'] as WeightUnit[]).map((u) => (
            <Pressable
              key={u}
              style={[styles.chip, settings.weightUnit === u && styles.chipActive]}
              onPress={() => saveSettings({ weightUnit: u })}
            >
              <Text style={settings.weightUnit === u ? styles.chipTextActive : styles.chipText}>{u}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={sharedStyles.helperText}>Weekly goal (workouts per week)</Text>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepBtn}
            onPress={() => settings.weeklyGoal > 1 && saveSettings({ weeklyGoal: settings.weeklyGoal - 1 })}
            accessibilityLabel="Decrease goal"
          >
            <Ionicons name="remove" size={22} color={COLORS.accent} />
          </Pressable>
          <Text style={styles.goalValue}>{settings.weeklyGoal}</Text>
          <Pressable
            style={styles.stepBtn}
            onPress={() => settings.weeklyGoal < 14 && saveSettings({ weeklyGoal: settings.weeklyGoal + 1 })}
            accessibilityLabel="Increase goal"
          >
            <Ionicons name="add" size={22} color={COLORS.accent} />
          </Pressable>
        </View>
      </View>

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>Privacy</Text>
        {switchRow(
          'Public profile',
          !!profile?.isPublic,
          setPublic,
          profile?.isPublic ? 'Anyone can follow you and see your public workouts.' : 'Only approved followers see your workouts.'
        )}
        <Text style={sharedStyles.helperText}>Default for new posts</Text>
        <VisibilityPicker
          value={settings.defaultVisibility}
          onChange={(v: Visibility) => saveSettings({ defaultVisibility: v })}
          canPublic={!!profile?.isPublic}
        />
        {linkRow('Blocked users', () => router.push('/blocked'))}
      </View>

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>Notifications</Text>
        {switchRow('Follows and requests', settings.notifyFollows, (v) => saveSettings({ notifyFollows: v }))}
        {switchRow('Likes', settings.notifyLikes, (v) => saveSettings({ notifyLikes: v }))}
        {switchRow('Comments', settings.notifyComments, (v) => saveSettings({ notifyComments: v }))}
        {profile?.isModerator && switchRow('Reports', settings.notifyReports, (v) => saveSettings({ notifyReports: v }), 'Moderator alerts')}
      </View>

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>Apple Health</Text>
        {switchRow(
          'Save workouts to Apple Health',
          settings.healthkitWriteEnabled,
          toggleHealth,
          'Bulletproof only writes finished workouts. It never reads your Health data.'
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>About</Text>
        {linkRow('Terms of Use', () => openUrl(TERMS_URL), 'open-outline')}
        {linkRow('Privacy Policy', () => openUrl(PRIVACY_URL), 'open-outline')}
        {linkRow('Support', () => openUrl(SUPPORT_URL), 'open-outline')}
      </View>

      <View style={sharedStyles.card}>
        <Text style={TYPE.sectionTitle}>Account</Text>
        <Text style={sharedStyles.helperText}>{account}</Text>
        <Pressable style={styles.linkRow} onPress={confirmSignOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={startDelete}>
          <Text style={styles.danger}>Delete account</Text>
        </Pressable>
      </View>

      <Modal visible={deleteOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
            <Text style={TYPE.screenTitle}>Delete account</Text>
            <Text style={TYPE.body}>
              This permanently deletes your account, workouts, photos and routines. Type DELETE to confirm.
            </Text>
            <TextInput
              style={sharedStyles.textInput}
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder="DELETE"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
            />
            {deleteError && <Text style={sharedStyles.warningText}>{deleteError}</Text>}
            <Pressable
              style={[styles.deleteBtn, (!canConfirmDelete(deleteText) || deleting) && styles.dim]}
              disabled={!canConfirmDelete(deleteText) || deleting}
              onPress={confirmDelete}
            >
              <Text style={sharedStyles.primaryButtonText}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} disabled={deleting} onPress={() => setDeleteOpen(false)}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.5 },
  flex: { flex: 1 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  link: { color: COLORS.accent, fontWeight: '600', fontSize: 15 },
  danger: { color: COLORS.danger, fontWeight: '600', fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  chipRow: { flexDirection: 'row', gap: SPACING.sm },
  chip: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { color: COLORS.ink },
  chipTextActive: { color: COLORS.card, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  goalValue: { fontSize: 24, fontWeight: '700', color: COLORS.ink, minWidth: 36, textAlign: 'center' },
  deleteBtn: { backgroundColor: COLORS.danger, borderRadius: 12, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancel: { alignItems: 'center', paddingVertical: SPACING.sm },
});
