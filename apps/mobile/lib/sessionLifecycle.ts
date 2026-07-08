// apps/mobile/lib/sessionLifecycle.ts
//
// Start/End workout, the "resume or discard" flow for the DB-enforced
// single-active-session rule, and the felt-rating write. The unique
// index is read verbatim from supabase/migrations/20260623145000_expand_
// sessions.sql:
//
//   create unique index sessions_one_active_per_owner
//     on sessions (owner_id) where (ended_at is null);
//
// startSession always attempts the insert directly -- no pre-check
// select-then-insert, which would race against a second concurrent
// Start Workout tap (e.g. two devices, or a double-tap before the first
// request resolves). On failure, isActiveSessionConflict checks the
// real Postgres SQLSTATE for unique_violation (error.code === '23505'),
// not a message string-match, since @supabase/supabase-js's
// PostgrestError surfaces the underlying Postgres error code on `.code`
// and message wording is not a stable contract to match against. See
// docs/superpowers/specs/2026-06-24-logger-design.md Decision 5.
//
// notifyActiveSessionChange/subscribeToActiveSessionChanges close a real
// gap found while root-causing the "persistent banner doesn't reliably
// show a just-started/just-ended session" report: app/_layout.tsx's
// activeSession state was only ever refreshed by its own AppState
// foreground-transition listener (or the initial mount fetch) -- no code
// path connected startSession/endSession/discardActiveSession, called
// from Logger, Home's Start button, and the ad-hoc workout flow, back to
// that state. A session started or ended without an intervening
// background->foreground cycle left the banner stale until one happened
// to occur. This is a tiny in-process pub/sub (not Supabase Realtime --
// no new infra, no websocket-reconnect edge cases to reason about) so
// every mutation site notifies _layout.tsx immediately, while the
// existing foreground refetch stays as a reconciliation fallback (e.g.
// after backgrounding for a long time, or a session changed from another
// device).
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import type { SessionType } from './recommendations';

type ActiveSessionListener = (session: ActiveSessionRow | null) => void;

const activeSessionListeners = new Set<ActiveSessionListener>();

export function subscribeToActiveSessionChanges(listener: ActiveSessionListener): () => void {
  activeSessionListeners.add(listener);
  return () => {
    activeSessionListeners.delete(listener);
  };
}

function notifyActiveSessionChange(session: ActiveSessionRow | null): void {
  for (const listener of activeSessionListeners) {
    listener(session);
  }
}

export interface ActiveSessionRow {
  readonly id: string;
  readonly date: string;
  readonly type: SessionType;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly feltRating: number | null;
  readonly isAdhoc: boolean;
}

interface RawSessionRow {
  id: string;
  date: string;
  type: SessionType;
  started_at: string | null;
  ended_at: string | null;
  felt_rating: number | null;
  ad_hoc_exercise_ids: string[] | null;
}

function toActiveSessionRow(row: RawSessionRow): ActiveSessionRow {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    feltRating: row.felt_rating,
    // ad_hoc_exercise_ids is null for a block-based session (startSession
    // never sets it) and a real array (possibly empty) for one started via
    // the ad-hoc "+" flow -- see migration 20260707110000. Loose `!= null`
    // so `undefined` (a row read before that migration existed) also reads
    // as non-ad-hoc rather than throwing the banner into the wrong route.
    isAdhoc: row.ad_hoc_exercise_ids != null,
  };
}

/**
 * Where tapping the persistent active-session banner should take the user.
 * An ad-hoc session has a dedicated resume route (its own sessionId); a
 * block-based session doesn't record which blockId it belongs to (a
 * session can span multiple blocks -- design spec Decision 6's Non-goal),
 * so the best a banner tap can do is drop them on Home to re-pick the
 * block, per Decision 7.
 */
export function resumeRouteForSession(session: ActiveSessionRow): string {
  return session.isAdhoc ? `/logger/adhoc/${session.id}` : '/(tabs)';
}

/**
 * Detects Postgres SQLSTATE 23505 (unique_violation) -- the exact code a
 * second concurrent insert against sessions_one_active_per_owner
 * produces. Accepts a loosely-typed error so call sites don't need to
 * import supabase-js's PostgrestError type just to call this helper.
 */
export function isActiveSessionConflict(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

const SESSION_SELECT = 'id, date, type, started_at, ended_at, felt_rating, ad_hoc_exercise_ids';

export async function fetchActiveSession(): Promise<ActiveSessionRow | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .is('ended_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toActiveSessionRow(data as RawSessionRow) : null;
}

export async function startSession(
  blockType: SessionType,
  options?: { readonly adhoc?: boolean }
): Promise<{ ok: true; session: ActiveSessionRow } | { ok: false; conflict: true }> {
  const now = new Date();
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      date: localDateString(now),
      type: blockType,
      started_at: now.toISOString(),
      ended_at: null,
      // Only the ad-hoc "+" flow sets this explicitly; a block-based start
      // leaves it out entirely so it lands NULL (see migration
      // 20260707110000), which is what marks a session as non-ad-hoc.
      ...(options?.adhoc ? { ad_hoc_exercise_ids: [] } : {}),
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    if (isActiveSessionConflict(error)) {
      return { ok: false, conflict: true };
    }
    throw new Error(error.message);
  }

  const session = toActiveSessionRow(data as RawSessionRow);
  notifyActiveSessionChange(session);
  return { ok: true, session };
}

export async function endSession(sessionId: string): Promise<ActiveSessionRow> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const ended = toActiveSessionRow(data as RawSessionRow);
  notifyActiveSessionChange(null);
  return ended;
}

/**
 * Closes an abandoned active session without recording a real workout
 * duration -- the "Discard it" half of the conflict-resolution prompt
 * (design spec Decision 5). Distinct from endSession only in caller
 * intent; both write the same ended_at column, since the schema has no
 * separate "discarded" flag and adding one is out of this phase's scope.
 */
export async function discardActiveSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    throw new Error(error.message);
  }

  notifyActiveSessionChange(null);
}

export async function submitFeltRating(sessionId: string, feltRating: number): Promise<void> {
  const { error } = await supabase.from('sessions').update({ felt_rating: feltRating }).eq('id', sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
