// apps/mobile/lib/signOut.ts
//
// Sign out, first dropping this device's push token (while the session can
// still authorize the delete).
import { supabase } from './supabase';
import { unregisterPushToken } from './social/push';

export async function signOut(): Promise<void> {
  await unregisterPushToken();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
