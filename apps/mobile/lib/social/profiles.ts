// apps/mobile/lib/social/profiles.ts
//
// Profiles data layer. profiles has column-level grants: clients may NOT
// select `*` or `bio` -- always list explicit columns, and read bio through
// the profile_bio RPC (null when the caller can't view the profile's details).
// Writes never ask for the row back (that would re-select ungranted columns).
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { avatarPath, randomId } from './imageSizing';
import { forgetSignedUrl, prepareJpeg, uploadLocalJpeg } from './images';

export { normalizeHandle, handleError, displayNameError } from './handles';
export { signedUrl } from './images';

/** The only columns clients may select from profiles. */
export const PROFILE_COLUMNS = 'id, handle, display_name, avatar_path, is_public, is_moderator, terms_accepted_at, created_at';

/** What non-followers of a private profile may see: no bio, counts or workouts. */
export interface ProfileCard {
  id: string;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  isPublic: boolean;
}

export interface Profile extends ProfileCard {
  bio: string | null;
  isModerator: boolean;
}

export type FollowStatus = 'none' | 'pending' | 'accepted';

export interface ProfileDetail extends Profile {
  canViewDetails: boolean;
  followStatus: FollowStatus;
  followsMe: boolean;
  followerCount: number | null;
  followingCount: number | null;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function toCard(r: any): ProfileCard {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarPath: r.avatar_path ?? null,
    isPublic: !!r.is_public,
  };
}

// ---- change events: the root layout re-checks "needs onboarding" ---------

const listeners = new Set<() => void>();

export function subscribeToProfileChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyProfileChanged(): void {
  listeners.forEach((cb) => cb());
}

// ---- reads -----------------------------------------------------------------

export async function fetchBio(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('profile_bio', { p_id: id });
  check(error);
  return (data as string | null) ?? null;
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const id = await getMyId();
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  check(error);
  if (!data) return null;
  const bio = await fetchBio(id).catch(() => null);
  return { ...toCard(data), bio, isModerator: !!(data as any).is_moderator };
}

export async function fetchProfileCards(ids: readonly string[]): Promise<Map<string, ProfileCard>> {
  const unique = Array.from(new Set(ids));
  const out = new Map<string, ProfileCard>();
  if (unique.length === 0) return out;
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', unique);
  check(error);
  for (const r of (data ?? []) as any[]) out.set(r.id, toCard(r));
  return out;
}

export async function fetchProfile(id: string): Promise<ProfileDetail> {
  const me = await getMyId();
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  check(error);
  // Blocked either way looks the same as "does not exist" (RLS hides the row).
  if (!data) throw new Error('This profile is unavailable.');

  const none = Promise.resolve({ data: null, error: null });
  const [viewRes, outRes, inRes] = await Promise.all([
    supabase.rpc('can_view_profile_details', { p_id: id }),
    id === me ? none : supabase.from('follows').select('status').eq('follower_id', me).eq('followee_id', id).maybeSingle(),
    id === me ? none : supabase.from('follows').select('status').eq('follower_id', id).eq('followee_id', me).maybeSingle(),
  ]);
  check(viewRes.error);
  check(outRes.error);
  check(inRes.error);
  const canViewDetails = !!viewRes.data;

  let bio: string | null = null;
  let followerCount: number | null = null;
  let followingCount: number | null = null;
  if (canViewDetails) {
    const [bioRes, countRes] = await Promise.all([
      supabase.rpc('profile_bio', { p_id: id }),
      supabase.rpc('profile_follow_counts', { p_id: id }),
    ]);
    check(bioRes.error);
    check(countRes.error);
    bio = (bioRes.data as string | null) ?? null;
    const row = ((countRes.data ?? []) as any[])[0];
    followerCount = row?.follower_count ?? null;
    followingCount = row?.following_count ?? null;
  }

  return {
    ...toCard(data),
    bio,
    isModerator: !!(data as any).is_moderator,
    canViewDetails,
    followStatus: ((outRes.data as any)?.status as FollowStatus | undefined) ?? 'none',
    followsMe: (inRes.data as any)?.status === 'accepted',
    followerCount,
    followingCount,
  };
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  check(error);
  return !data;
}

// ---- writes ----------------------------------------------------------------

/** Maps DB errors to messages worth showing. The word filter's P0001 message is already user-facing. */
function writeError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('That handle is taken.');
  return new Error(error.message);
}

export async function uploadAvatar(localUri: string): Promise<string> {
  const me = await getMyId();
  const prepared = await prepareJpeg(localUri, 512);
  const path = avatarPath(me, randomId());
  await uploadLocalJpeg('avatars', path, prepared.uri);
  return path;
}

export async function createProfile(input: {
  handle: string;
  displayName: string;
  avatarUri?: string | null;
  termsAccepted: true;
}): Promise<void> {
  let avatar: string | null = null;
  if (input.avatarUri) {
    // A failed photo upload should not block account creation.
    avatar = await uploadAvatar(input.avatarUri).catch(() => null);
  }
  const { error } = await supabase.from('profiles').insert({
    handle: input.handle,
    display_name: input.displayName.trim(),
    avatar_path: avatar,
    terms_accepted_at: new Date().toISOString(),
  });
  if (error) {
    // A retry after a lost response hits our own primary key (23505 on id),
    // which would read as "handle taken": if the profile now exists, it's done.
    if (error.code === '23505' && (await fetchMyProfile().catch(() => null))) {
      notifyProfileChanged();
      return;
    }
    throw writeError(error);
  }
  notifyProfileChanged();
}

export interface ProfilePatch {
  handle?: string;
  displayName?: string;
  bio?: string | null;
  avatarUri?: string | null;
  isPublic?: boolean;
}

export async function updateProfile(patch: ProfilePatch, previousAvatarPath?: string | null): Promise<void> {
  const me = await getMyId();
  const row: Record<string, unknown> = {};
  if (patch.handle !== undefined) row.handle = patch.handle;
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
  if (patch.bio !== undefined) row.bio = patch.bio === null || patch.bio.trim() === '' ? null : patch.bio.trim();
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.avatarUri) row.avatar_path = await uploadAvatar(patch.avatarUri);
  const { error } = await supabase.from('profiles').update(row).eq('id', me);
  if (error) throw writeError(error);
  if (patch.avatarUri && previousAvatarPath) {
    forgetSignedUrl('avatars', previousAvatarPath);
    // Best effort: an orphaned old avatar is harmless.
    await supabase.storage.from('avatars').remove([previousAvatarPath]).catch(() => undefined);
  }
  notifyProfileChanged();
}
