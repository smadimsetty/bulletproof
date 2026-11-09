// apps/mobile/lib/signOut.ts
//
// Sign out, first dropping this device's push token (while the session can
// still authorize the delete).
import { supabase } from './supabase';
import { unregisterPushToken } from './social/push';

export async function signOut(): Promise<void> {
  await unregisterPushToken();
  // The default (global) sign-out needs the network; offline it errors and
  // keeps the session, which would strand the user. Fall back to local.
  const { error } = await supabase.auth.signOut();
  if (error) {
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
    if (localError) throw new Error(localError.message);
  }
}
