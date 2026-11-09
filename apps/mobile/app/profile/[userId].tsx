// apps/mobile/app/profile/[userId].tsx
//
// Someone else's profile (or mine, if linked to). Header title is their @handle; the header
// menu offers Report user / Block (visual spec 4.19).
import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import ProfileView from '../../components/social/ProfileView';
import { useSafety } from '../../components/social/ReportSheet';
import { ActionSheet, IconButton } from '../../components/ui';
import { getMyId } from '../../lib/session';
import type { ProfileDetail } from '../../lib/social/profiles';

// Let the ActionSheet finish dismissing before the next sheet presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 350;

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [loaded, setLoaded] = useState<ProfileDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const safety = useSafety();

  const onLoaded = useCallback((p: ProfileDetail) => {
    setLoaded(p);
    getMyId().then(setMeId).catch(() => undefined);
  }, []);

  const showMenu = !!loaded && !!meId && loaded.id !== meId;
  return (
    <>
      <Stack.Screen
        options={{
          title: loaded ? `@${loaded.handle}` : 'Profile',
          headerRight: () =>
            showMenu ? <IconButton icon="ellipsis-horizontal" size="sm" accessibilityLabel="More options" onPress={() => setMenuOpen(true)} /> : null,
        }}
      />
      <ProfileView userId={userId} onLoaded={onLoaded} />
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={loaded ? `@${loaded.handle}` : undefined}
        actions={
          loaded
            ? [
                {
                  label: 'Report user',
                  icon: 'flag-outline',
                  onPress: () =>
                    setTimeout(
                      () => safety.openReport({ type: 'user', id: loaded.id, label: `@${loaded.handle}`, blockUser: loaded }),
                      SHEET_HANDOFF_MS
                    ),
                },
                {
                  label: `Block @${loaded.handle}`,
                  icon: 'ban-outline',
                  destructive: true,
                  onPress: () => setTimeout(() => safety.confirmBlock(loaded, () => router.back()), SHEET_HANDOFF_MS),
                },
              ]
            : []
        }
      />
      {safety.element}
    </>
  );
}
