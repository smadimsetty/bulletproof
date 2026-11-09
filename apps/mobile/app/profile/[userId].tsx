// apps/mobile/app/profile/[userId].tsx
//
// Someone else's profile (or mine, if linked to). The header menu with
// Report / Block is added alongside the safety features.
import { Stack, useLocalSearchParams } from 'expo-router';
import ProfileView from '../../components/social/ProfileView';

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ProfileView userId={userId} />
    </>
  );
}
