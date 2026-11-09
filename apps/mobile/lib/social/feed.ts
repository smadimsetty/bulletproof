// apps/mobile/lib/social/feed.ts
//
// The home feed: finished, non-private workouts from me and the people I
// follow (accepted), newest first with keyset paging, minus workouts I hid.
// RLS enforces who may actually read what (blocks, pending follows,
// moderation hides); the owner list here only scopes the query.
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { fetchFolloweeIds } from './follows';
import { fetchProfileCards, type ProfileCard } from './profiles';
import { feedCursorFilter, nextCursor, type FeedCursor } from './feedCursor';

export const FEED_PAGE = 20;

// Typed as plain string on purpose: a literal makes supabase-js's select-string
// type parser recurse too deeply (TS2589) on this many nested embeds.
const FEED_SELECT: string = `id, owner_id, title, notes, started_at, ended_at,
       workout_media ( path, position ),
       workout_exercises ( id, workout_sets ( id ) ),
       workout_likes ( count ),
       workout_comments ( count )`;

export interface FeedItem {
  id: string;
  ownerId: string;
  author: ProfileCard | null;
  title: string;
  notes: string | null;
  startedAt: string;
  endedAt: string;
  mediaPaths: string[];
  exerciseCount: number;
  setCount: number;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

export interface FeedPage {
  items: FeedItem[];
  /** Cursor for the next page, or null when there is nothing more. */
  cursor: FeedCursor | null;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function countOf(embed: unknown): number {
  return ((embed as any[] | null | undefined)?.[0]?.count as number | undefined) ?? 0;
}

export async function fetchFeed(cursor: FeedCursor | null, limit = FEED_PAGE): Promise<FeedPage> {
  const me = await getMyId();
  const [followees, hiddenRes] = await Promise.all([
    fetchFolloweeIds(),
    supabase.from('hidden_workouts').select('workout_id').eq('user_id', me),
  ]);
  check(hiddenRes.error);
  const hiddenIds = ((hiddenRes.data ?? []) as any[]).map((r) => r.workout_id as string);

  let q = supabase
    .from('workouts')
    .select(FEED_SELECT)
    .in('owner_id', [me, ...followees])
    .neq('visibility', 'private')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .order('id', { ascending: false });
  if (hiddenIds.length > 0) q = q.not('id', 'in', `(${hiddenIds.join(',')})`);
  if (cursor) q = q.or(feedCursorFilter(cursor));
  const { data, error } = await q.limit(limit);
  check(error);
  const rows = (data ?? []) as any[];

  const ids = rows.map((r) => r.id as string);
  const [authors, likedRes] = await Promise.all([
    fetchProfileCards(rows.map((r) => r.owner_id as string)),
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('workout_likes').select('workout_id').eq('user_id', me).in('workout_id', ids),
  ]);
  check(likedRes.error);
  const liked = new Set(((likedRes.data ?? []) as any[]).map((r) => r.workout_id as string));

  const items: FeedItem[] = rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    author: authors.get(r.owner_id) ?? null,
    title: r.title,
    notes: r.notes,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    mediaPaths: ((r.workout_media ?? []) as any[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m) => m.path as string),
    exerciseCount: (r.workout_exercises ?? []).length,
    setCount: (r.workout_exercises ?? []).reduce((n: number, e: any) => n + (e.workout_sets ?? []).length, 0),
    likeCount: countOf(r.workout_likes),
    likedByMe: liked.has(r.id),
    commentCount: countOf(r.workout_comments),
  }));
  return { items, cursor: nextCursor(items, limit) };
}
