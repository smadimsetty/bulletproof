// apps/mobile/app/settings.tsx
//
// Settings (visual spec 4.22), reached from the Profile tab's gear: profile, units, weekly
// goal, default post visibility, public/private profile, blocked users, notification toggles,
// Apple Health write, legal links, account (sign out, delete). The old training-engine fields
// (split, pains, diet, location...) are no longer shown; their data stays in user_profile.
// TODO(stage4): spec shows the blocked-user count beside "Blocked users"; that needs an extra
// query this screen doesn't make, so only the chevron is shown.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../lib/haptics';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/signOut';
import { DEFAULT_SETTINGS, fetchUserSettings, updateUserSettings, type UserSettings, type Visibility } from '../lib/userSettings';
import { fetchMyProfile, updateProfile, type Profile } from '../lib/social/profiles';
import { requestHealthWriteAccess } from '../lib/healthkitWrite';
import { accountLabel } from '../lib/settingsFormat';
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../lib/links';
import { PUBLIC_DISABLED_HINT, VISIBILITY_OPTIONS, visibilityLabel } from '../lib/social/visibility';
import type { WeightUnit } from '../lib/units';
import Avatar from '../components/social/Avatar';
import WeeklyGoalSheet from '../components/progress/WeeklyGoalSheet';
import {
  ConfirmSheet, ErrorState, ListGroup, ListRow, ScreenScroll, SectionHeader, SegmentedControl, Sheet, SkeletonCard, SwitchRow, useToast,
} from '../components/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState('Signed in');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [privateConfirmOpen, setPrivateConfirmOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  /** Optimistic settings save: reverts and shows a danger toast with Retry on failure. */
  async function saveSettings(patch: Partial<UserSettings>): Promise<boolean> {
    if (savingRef.current) return false;
    savingRef.current = true;
    const before = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await updateUserSettings(patch));
      return true;
    } catch (err: any) {
      setSettings(before);
      toast.show({
        message: `Couldn't save: ${err?.message ?? 'that change'}`,
        tone: 'danger',
        action: { label: 'Retry', onPress: () => void saveSettings(patch) },
      });
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function applyPublic(next: boolean) {
    if (!profile || savingRef.current) return;
    savingRef.current = true;
    try {
      await updateProfile({ isPublic: next });
      setProfile({ ...profile, isPublic: next });
      // A Public default makes no sense for a private profile.
      if (!next && settings.defaultVisibility === 'public') {
        savingRef.current = false;
        await saveSettings({ defaultVisibility: 'followers' });
      }
    } catch (err: any) {
      toast.show({
        message: err?.message ?? 'Could not update your profile.',
        tone: 'danger',
        action: { label: 'Retry', onPress: () => void applyPublic(next) },
      });
    } finally {
      savingRef.current = false;
    }
  }

  function setPublic(next: boolean) {
    if (!profile || savingRef.current) return;
    if (!next) setPrivateConfirmOpen(true);
    else void applyPublic(true);
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

  async function doSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setSignOutOpen(false);
    } catch (err: any) {
      setSignOutOpen(false);
      haptics.error();
      Alert.alert('Error', err?.message ?? 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  }

  async function doDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw new Error(error.message);
      setDeleteOpen(false);
      // The auth user is gone server-side; just clear the local session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err: any) {
      haptics.error();
      Alert.alert('Error', err?.message ?? "Deletion didn't finish — please try again.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const openUrl = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);
  const open = <Ionicons name="open-outline" size={18} color={COLORS.textTertiary} />;
  const build = Constants.nativeBuildVersion;
  const version = `Bulletproof ${Constants.expoConfig?.version ?? ''}${build ? ` (${build})` : ''}`.trim();

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Settings' }} />
        <ScreenScroll>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScreenScroll>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Settings' }} />
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

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScreenScroll contentContainerStyle={styles.content}>
        {profile ? (
          <ListGroup>
            <ListRow
              title={profile.displayName}
              subtitle={`@${profile.handle} · Edit profile`}
              leading={<Avatar path={profile.avatarPath} name={profile.displayName} size="sm" />}
              trailing="chevron"
              onPress={() => router.push('/edit-profile')}
            />
          </ListGroup>
        ) : null}

        <SectionHeader title="Training" inset={SPACING.xs} />
        <ListGroup>
          <ListRow title="Units" leading={{ icon: 'barbell-outline' }} value={settings.weightUnit} trailing="chevron" onPress={() => setUnitsOpen(true)} />
          <ListRow
            title="Weekly goal"
            leading={{ icon: 'flag-outline' }}
            value={`${settings.weeklyGoal} / week`}
            trailing="chevron"
            onPress={() => setGoalOpen(true)}
          />
        </ListGroup>

        <SectionHeader title="Privacy" inset={SPACING.xs} />
        <ListGroup>
          <SwitchRow
            title="Public profile"
            subtitle={profile?.isPublic ? 'Anyone can see your public workouts' : 'Only approved followers see your workouts'}
            leading={{ icon: 'globe-outline' }}
            value={!!profile?.isPublic}
            onValueChange={setPublic}
          />
          <ListRow
            title="Default post visibility"
            leading={{ icon: 'eye-outline' }}
            value={visibilityLabel(settings.defaultVisibility)}
            trailing="chevron"
            onPress={() => setVisibilityOpen(true)}
          />
          <ListRow title="Blocked users" leading={{ icon: 'ban-outline' }} trailing="chevron" onPress={() => router.push('/blocked')} />
        </ListGroup>

        <SectionHeader title="Notifications" inset={SPACING.xs} />
        <ListGroup>
          <SwitchRow title="Follows and requests" value={settings.notifyFollows} onValueChange={(v) => saveSettings({ notifyFollows: v })} />
          <SwitchRow title="Likes" value={settings.notifyLikes} onValueChange={(v) => saveSettings({ notifyLikes: v })} />
          <SwitchRow title="Comments" value={settings.notifyComments} onValueChange={(v) => saveSettings({ notifyComments: v })} />
          {profile?.isModerator ? (
            <SwitchRow title="Reports" subtitle="Moderator alerts" value={settings.notifyReports} onValueChange={(v) => saveSettings({ notifyReports: v })} />
          ) : null}
        </ListGroup>

        <SectionHeader title="Apple Health" inset={SPACING.xs} />
        <ListGroup>
          <SwitchRow
            title="Save workouts to Apple Health"
            subtitle="Bulletproof only writes finished workouts. It never reads your Health data."
            value={settings.healthkitWriteEnabled}
            onValueChange={toggleHealth}
          />
        </ListGroup>

        <SectionHeader title="About" inset={SPACING.xs} />
        <ListGroup>
          <ListRow title="Terms of Use" trailing={open} onPress={() => openUrl(TERMS_URL)} />
          <ListRow title="Privacy Policy" trailing={open} onPress={() => openUrl(PRIVACY_URL)} />
          <ListRow title="Support" trailing={open} onPress={() => openUrl(SUPPORT_URL)} />
        </ListGroup>

        <SectionHeader title="Account" inset={SPACING.xs} />
        <ListGroup>
          <ListRow title={account} leading={{ icon: 'person-circle-outline' }} />
          <ListRow title="Sign out" leading={{ icon: 'log-out-outline' }} onPress={() => setSignOutOpen(true)} />
          <ListRow title="Delete account" destructive leading={{ icon: 'trash-outline' }} onPress={() => setDeleteOpen(true)} />
        </ListGroup>

        <Text style={[TYPE.footnote, styles.version]}>{version}</Text>
      </ScreenScroll>

      <Sheet visible={unitsOpen} onClose={() => setUnitsOpen(false)} title="Units" subtitle="Weight shown in the logger and stats">
        <View style={styles.sheetBody}>
          <SegmentedControl
            options={[
              { value: 'lbs', label: 'lbs' },
              { value: 'kg', label: 'kg' },
            ]}
            value={settings.weightUnit}
            onChange={(u) => {
              void saveSettings({ weightUnit: u as WeightUnit });
              setUnitsOpen(false);
            }}
          />
        </View>
      </Sheet>
      <WeeklyGoalSheet
        visible={goalOpen}
        current={settings.weeklyGoal}
        onClose={() => setGoalOpen(false)}
        onSave={async (goal) => {
          if (!(await saveSettings({ weeklyGoal: goal }))) throw new Error('Could not save your weekly goal.');
        }}
      />
      <Sheet visible={visibilityOpen} onClose={() => setVisibilityOpen(false)} title="Default post visibility">
        <View>
          {VISIBILITY_OPTIONS.map((o) => {
            const blocked = o.value === 'public' && !profile?.isPublic;
            return (
              <ListRow
                key={o.value}
                title={o.label}
                subtitle={blocked ? PUBLIC_DISABLED_HINT : undefined}
                disabled={blocked}
                trailing={
                  settings.defaultVisibility === o.value ? <Ionicons name="checkmark" size={18} color={COLORS.accent} /> : undefined
                }
                onPress={() => {
                  void saveSettings({ defaultVisibility: o.value as Visibility });
                  setVisibilityOpen(false);
                }}
              />
            );
          })}
        </View>
      </Sheet>
      <ConfirmSheet
        visible={privateConfirmOpen}
        onClose={() => setPrivateConfirmOpen(false)}
        title="Make your profile private?"
        body="Only approved followers will see your workouts."
        confirmLabel="Make private"
        onConfirm={() => {
          setPrivateConfirmOpen(false);
          void applyPublic(false);
        }}
      />
      <ConfirmSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out?"
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={doSignOut}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account?"
        body="This permanently deletes your workouts, sprints, photos and profile. This can't be undone."
        confirmLabel="Delete my account"
        destructive
        requireText="DELETE"
        loading={deleting}
        onConfirm={doDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: SPACING.xxl },
  sheetBody: { paddingVertical: SPACING.lg },
  version: { textAlign: 'center', paddingTop: SPACING.lg },
});
