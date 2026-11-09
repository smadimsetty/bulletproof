// apps/mobile/lib/social/notifications.ts
//
// The activity inbox (notifications rows are created by DB triggers; clients
// may only read them and set read_at).
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { fetchProfileCards, type ProfileCard } from './profiles';

export type NotificationKind = 'follow_request' | 'follow_accepted' | 'new_follower' | 'like' | 'comment' | 'report';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actor: ProfileCard | null;
  actorId: string | null;
  workoutId: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchUnreadCount(): Promise<number> {
  const me = await getMyId();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me)
    .is('read_at', null);
  check(error);
  return count ?? 0;
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const me = await getMyId();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, actor_id, workout_id, comment_id, read_at, created_at')
    .eq('recipient_id', me)
    .order('created_at', { ascending: false })
    .limit(limit);
  check(error);
  const rows = (data ?? []) as any[];
  const actors = await fetchProfileCards(rows.map((r) => r.actor_id).filter(Boolean) as string[]);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actorId: r.actor_id ?? null,
    actor: r.actor_id ? actors.get(r.actor_id) ?? null : null,
    workoutId: r.workout_id ?? null,
    commentId: r.comment_id ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function markAllRead(): Promise<void> {
  const me = await getMyId();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me)
    .is('read_at', null);
  check(error);
  emitUnreadChanged();
}

// Tiny pub/sub so the tab bar's Feed badge refreshes right after the inbox marks everything read.
const unreadListeners = new Set<() => void>();

export function subscribeToUnreadChanges(cb: () => void): () => void {
  unreadListeners.add(cb);
  return () => {
    unreadListeners.delete(cb);
  };
}

export function emitUnreadChanged(): void {
  unreadListeners.forEach((cb) => cb());
}
