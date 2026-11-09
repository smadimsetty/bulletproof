// apps/mobile/components/social/FollowButton.tsx
//
// Follow / Requested / Following / Follow back (visual spec 4.19). Tapping Following or
// Requested asks to confirm (ConfirmSheet) before unfollowing. The caller re-reads the profile
// after onChanged, since the server decides pending vs accepted.
import { useRef, useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as haptics from '../../lib/haptics';
import { follow, unfollow } from '../../lib/social/follows';
import { followButtonLabel } from '../../lib/social/followState';
import type { FollowStatus } from '../../lib/social/profiles';
import { ensurePushRegistered } from '../../lib/social/push';
import { Button, ConfirmSheet, useToast } from '../ui';

export default function FollowButton({
  userId,
  handle,
  status,
  followsMe,
  onChanged,
  size = 'md',
}: {
  userId: string;
  handle: string;
  status: FollowStatus;
  followsMe: boolean;
  onChanged: () => void | Promise<void>;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Synchronous guard: two taps can land before `busy` re-renders.
  const busyRef = useRef(false);
  const label = followButtonLabel(status, followsMe);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (err: any) {
      toast.show({ message: err?.message ?? 'Something went wrong.', tone: 'danger' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function onPress() {
    haptics.select();
    if (status === 'none') {
      // First follow is a natural moment to ask for push (once, ever).
      run(async () => {
        await follow(userId);
        ensurePushRegistered({ ask: true });
      });
      return;
    }
    setConfirmOpen(true);
  }

  const pending = status === 'pending';
  return (
    <>
      {/* Remount on a label change so the new label cross-fades in (150 ms). */}
      <Animated.View key={label} entering={FadeIn.duration(150)} style={size === 'md' ? { alignSelf: 'stretch' } : undefined}>
        <Button
          title={label}
          size={size}
          fullWidth={size === 'md'}
          variant={status === 'none' ? 'primary' : 'secondary'}
          icon={pending ? 'time-outline' : status === 'accepted' ? 'checkmark' : undefined}
          loading={busy}
          onPress={onPress}
          accessibilityLabel={`${label} @${handle}`}
        />
      </Animated.View>
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={pending ? 'Cancel request?' : `Unfollow @${handle}?`}
        body={pending ? `Cancel your follow request to @${handle}?` : undefined}
        confirmLabel={pending ? 'Cancel request' : 'Unfollow'}
        cancelLabel={pending ? 'Keep request' : 'Cancel'}
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          run(() => unfollow(userId));
        }}
      />
    </>
  );
}
