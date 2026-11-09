// apps/mobile/app/profile/[userId].tsx
//
// Someone else's profile (or mine, if linked to). The header menu with
// Report / Block is added alongside the safety features.
import { useCallback, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ProfileView from '../../components/social/ProfileView';
import { useSafety } from '../../components/social/ReportSheet';
import { COLORS } from '../../lib/theme';
import { getMyId } from '../../lib/session';
import type { ProfileDetail } from '../../lib/social/profiles';

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [loaded, setLoaded] = useState<ProfileDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const safety = useSafety();

  const onLoaded = useCallback((p: ProfileDetail) => {
    setLoaded(p);
    getMyId().then(setMeId).catch(() => undefined);
  }, []);

  function openMenu() {
    if (!loaded) return;
    Alert.alert(`@${loaded.handle}`, undefined, [
      {
        text: 'Report user',
        onPress: () => safety.openReport({ type: 'user', id: loaded.id, label: `@${loaded.handle}` }),
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => safety.confirmBlock(loaded, () => router.back()),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const showMenu = !!loaded && !!meId && loaded.id !== meId;
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerRight: () =>
            showMenu ? (
              <Pressable onPress={openMenu} hitSlop={8} accessibilityLabel="More options">
                <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.accent} />
              </Pressable>
            ) : null,
        }}
      />
      <ProfileView userId={userId} onLoaded={onLoaded} />
      {safety.element}
    </>
  );
}
