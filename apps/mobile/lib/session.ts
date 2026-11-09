// apps/mobile/lib/session.ts
//
// The signed-in user's id, read from the persisted session (no network round
// trip). Own-data queries filter on it explicitly: since the social read
// policies (stage 3) let a user read followed users' workouts, relying on RLS
// alone to scope "my workouts" is no longer enough.
import { supabase } from './supabase';

export async function getMyId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in again.');
  return id;
}
