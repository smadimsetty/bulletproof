// apps/mobile/lib/social/follows.ts
//
// Follow graph + people search. The server decides the follow status on insert
// (accepted for public profiles, pending otherwise), so follow() just inserts
// and the caller re-reads. Blocked users never show up: RLS hides their
// profile rows and list_follow_profiles filters them out.
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { PROFILE_COLUMNS, toCard, type ProfileCard } from './profiles';
import { sanitizeSearchQuery } from './followState';

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function follow(userId: string): Promise<void> {
  const { error } = await supabase.from('follows').insert({ followee_id: userId });
  // 23505 = already following/requested: idempotent for a double tap.
  if (error && (error as any).code !== '23505') throw new Error(error.message);
}

export async function unfollow(userId: string): Promise<void> {
  const me = await getMyId();
  const { error } = await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', userId);
  check(error);
}

export async function acceptFollow(followerId: string): Promise<void> {
  const me = await getMyId();
  const { error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('followee_id', me);
  check(error);
}

export async function declineFollow(followerId: string): Promise<void> {
  const me = await getMyId();
  const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('followee_id', me);
  check(error);
}

/** Same row delete as declining; named separately for the call sites. */
export const removeFollower = declineFollow;

export async function fetchFollowList(userId: string, kind: 'followers' | 'following', offset = 0, limit = 50): Promise<ProfileCard[]> {
  const { data, error } = await supabase.rpc('list_follow_profiles', {
    p_id: userId,
    p_kind: kind,
    p_limit: limit,
    p_offset: offset,
  });
  check(error);
  return ((data ?? []) as any[]).map(toCard);
}

/** Ids of everyone I follow (accepted). */
export async function fetchFolloweeIds(): Promise<string[]> {
  const me = await getMyId();
  const { data, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', me)
    .eq('status', 'accepted');
  check(error);
  return ((data ?? []) as any[]).map((r) => r.followee_id as string);
}

export async function searchProfiles(q: string): Promise<ProfileCard[]> {
  const term = sanitizeSearchQuery(q.replace(/^@+/, ''));
  if (term.length === 0) return [];
  const me = await getMyId();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .neq('id', me)
    .limit(20);
  check(error);
  return ((data ?? []) as any[]).map(toCard);
}
