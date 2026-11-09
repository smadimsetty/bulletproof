// apps/mobile/lib/social/interactions.ts
//
// Likes and comments. RLS decides who may do either (the reader must be able
// to read the workout; blocked users' likes/comments are invisible both ways).
// Word-filter rejections come back as Postgres P0001 "That text isn't allowed."
// and are surfaced verbatim.
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { fetchProfileCards, type ProfileCard } from './profiles';
import { commentError } from './commentRules';

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export interface SocialSummary {
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

export async function fetchSocialSummary(workoutId: string): Promise<SocialSummary> {
  const me = await getMyId();
  const [likes, mine, comments] = await Promise.all([
    supabase.from('workout_likes').select('workout_id', { count: 'exact', head: true }).eq('workout_id', workoutId),
    supabase.from('workout_likes').select('workout_id').eq('workout_id', workoutId).eq('user_id', me).maybeSingle(),
    supabase.from('workout_comments').select('id', { count: 'exact', head: true }).eq('workout_id', workoutId),
  ]);
  check(likes.error);
  check(mine.error);
  check(comments.error);
  return { likeCount: likes.count ?? 0, likedByMe: !!mine.data, commentCount: comments.count ?? 0 };
}

/** Like or unlike. Liking twice (double tap / race) is a no-op, not an error. */
export async function setLiked(workoutId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase.from('workout_likes').insert({ workout_id: workoutId });
    if (error && (error as any).code !== '23505') throw new Error(error.message);
    return;
  }
  const me = await getMyId();
  const { error } = await supabase.from('workout_likes').delete().eq('workout_id', workoutId).eq('user_id', me);
  check(error);
}

export interface Comment {
  id: string;
  ownerId: string;
  author: ProfileCard | null;
  body: string;
  createdAt: string;
  /** Hidden by moderation; only ever visible to its own author. */
  hidden: boolean;
}

export async function fetchComments(workoutId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('workout_comments')
    .select('id, owner_id, body, created_at, hidden_by_moderation')
    .eq('workout_id', workoutId)
    .order('created_at', { ascending: true });
  check(error);
  const rows = (data ?? []) as any[];
  const authors = await fetchProfileCards(rows.map((r) => r.owner_id as string));
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    author: authors.get(r.owner_id) ?? null,
    body: r.body,
    createdAt: r.created_at,
    hidden: !!r.hidden_by_moderation,
  }));
}

export async function addComment(workoutId: string, body: string): Promise<void> {
  const problem = commentError(body);
  if (problem) throw new Error(problem);
  const { error } = await supabase.from('workout_comments').insert({ workout_id: workoutId, body: body.trim() });
  check(error);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('workout_comments').delete().eq('id', commentId);
  check(error);
}

/** The owner of a workout (needed to know who may delete any comment on it). */
export async function fetchWorkoutOwnerId(workoutId: string): Promise<string | null> {
  const { data, error } = await supabase.from('workouts').select('owner_id').eq('id', workoutId).maybeSingle();
  check(error);
  return (data as any)?.owner_id ?? null;
}
