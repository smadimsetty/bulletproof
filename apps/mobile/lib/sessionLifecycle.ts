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
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import type { SessionType } from './recommendations';

export interface ActiveSessionRow {
  readonly id: string;
  readonly date: string;
  readonly type: SessionType;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly feltRating: number | null;
}

interface RawSessionRow {
  id: string;
  date: string;
  type: SessionType;
  started_at: string | null;
  ended_at: string | null;
  felt_rating: number | null;
}

function toActiveSessionRow(row: RawSessionRow): ActiveSessionRow {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    feltRating: row.felt_rating,
  };
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

const SESSION_SELECT = 'id, date, type, started_at, ended_at, felt_rating';

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
  blockType: SessionType
): Promise<{ ok: true; session: ActiveSessionRow } | { ok: false; conflict: true }> {
  const now = new Date();
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      date: localDateString(now),
      type: blockType,
      started_at: now.toISOString(),
      ended_at: null,
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    if (isActiveSessionConflict(error)) {
      return { ok: false, conflict: true };
    }
    throw new Error(error.message);
  }

  return { ok: true, session: toActiveSessionRow(data as RawSessionRow) };
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

  return toActiveSessionRow(data as RawSessionRow);
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
}

export async function submitFeltRating(sessionId: string, feltRating: number): Promise<void> {
  const { error } = await supabase.from('sessions').update({ felt_rating: feltRating }).eq('id', sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
