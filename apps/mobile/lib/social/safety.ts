// apps/mobile/lib/social/safety.ts
//
// Report / block / hide (App Store 1.2). Reporting a workout also hides it
// for the reporter immediately; blocking removes follows both ways and hides
// everything between the two users (all enforced server-side by RLS/triggers).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { fetchProfileCards } from './profiles';
import { reportFailureMessage, type ReportReason, type ReportTargetType } from './reportReasons';

const BLOCKED_CACHE_KEY = '@bulletproof/blocked-users';

export async function report(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  note: string
): Promise<void> {
  const { error } = await supabase.from('content_reports').insert({
    target_type: targetType,
    target_id: targetId,
    reason,
    note: note.trim() === '' ? null : note.trim(),
  });
  if (error) throw new Error(reportFailureMessage(error));
}

/** Hide a workout from my feed (it stays visible on its author's profile). */
export async function hideWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('hidden_workouts').insert({ workout_id: workoutId });
  if (error && (error as any).code !== '23505') throw new Error(error.message);
}

// Blocked users' profile rows are hidden from me by RLS, so their name/handle
// cannot be re-read later. Remember them locally at block time for the
// Blocked users screen (blocks made on another device fall back to a generic label).
interface BlockedInfo {
  id: string;
  handle: string;
  displayName: string;
}

async function readBlockedCache(): Promise<Record<string, BlockedInfo>> {
  try {
    const raw = await AsyncStorage.getItem(BLOCKED_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BlockedInfo>) : {};
  } catch {
    return {};
  }
}

async function writeBlockedCache(cache: Record<string, BlockedInfo>): Promise<void> {
  try {
    await AsyncStorage.setItem(BLOCKED_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The cache is cosmetic.
  }
}

export async function block(user: { id: string; handle: string; displayName: string }): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocked_id: user.id });
  if (error && (error as any).code !== '23505') throw new Error(error.message);
  const cache = await readBlockedCache();
  cache[user.id] = { id: user.id, handle: user.handle, displayName: user.displayName };
  await writeBlockedCache(cache);
}

export async function unblock(userId: string): Promise<void> {
  const me = await getMyId();
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
  if (error) throw new Error(error.message);
  const cache = await readBlockedCache();
  delete cache[userId];
  await writeBlockedCache(cache);
}

export interface BlockedUser {
  id: string;
  handle: string | null;
  displayName: string;
}

export async function fetchBlocked(): Promise<BlockedUser[]> {
  const me = await getMyId();
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', me);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as any[]).map((r) => r.blocked_id as string);
  const [cache, live] = await Promise.all([readBlockedCache(), fetchProfileCards(ids).catch(() => new Map())]);
  return ids.map((id) => {
    const card = live.get(id);
    const cached = cache[id];
    return {
      id,
      handle: card?.handle ?? cached?.handle ?? null,
      displayName: card?.displayName ?? cached?.displayName ?? 'Blocked user',
    };
  });
}
