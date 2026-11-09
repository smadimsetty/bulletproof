// apps/mobile/components/social/FollowButton.tsx
//
// Follow / Requested / Following / Follow back. Tapping Following or Requested
// asks to confirm before unfollowing. The caller re-reads the profile after
// onChanged, since the server decides pending vs accepted.
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, RADII, SPACING } from '../../lib/theme';
import { follow, unfollow } from '../../lib/social/follows';
import { followButtonLabel } from '../../lib/social/followState';
import type { FollowStatus } from '../../lib/social/profiles';

export default function FollowButton({
  userId,
  handle,
  status,
  followsMe,
  onChanged,
}: {
  userId: string;
  handle: string;
  status: FollowStatus;
  followsMe: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // Synchronous guard: two taps can land before `busy` re-renders.
  const busyRef = useRef(false);
  const label = followButtonLabel(status, followsMe);
  const outlined = status !== 'none';

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onPress() {
    if (status === 'none') {
      run(() => follow(userId));
      return;
    }
    const msg = status === 'pending' ? `Cancel your follow request to @${handle}?` : `Unfollow @${handle}?`;
    Alert.alert(msg, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: status === 'pending' ? 'Cancel request' : 'Unfollow', style: 'destructive', onPress: () => run(() => unfollow(userId)) },
    ]);
  }

  return (
    <Pressable
      style={[styles.button, outlined && styles.outlined, busy && styles.busy]}
      disabled={busy}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} @${handle}`}
    >
      <Text style={[styles.text, outlined && styles.outlinedText]}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  outlined: { backgroundColor: 'transparent' },
  busy: { opacity: 0.6 },
  text: { color: COLORS.card, fontWeight: '600', fontSize: 15 },
  outlinedText: { color: COLORS.accent },
});
