// apps/mobile/lib/social/textFilter.ts
//
// Client-side pre-check against the server's word filter (check_blocked_terms)
// so a rejected title/notes/comment fails with a friendly message BEFORE any
// side effects. The DB triggers remain the authority; this just avoids
// half-finished operations. A rejection is Postgres error code P0001 with the
// message "That text isn't allowed."
import { supabase } from '../supabase';

export const TEXT_NOT_ALLOWED = "That text isn't allowed.";

/** True when a thrown/returned error is the word filter's rejection. */
export function isWordFilterError(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'P0001' || error.message === TEXT_NOT_ALLOWED);
}

/** Throws Error("That text isn't allowed.") if any of the texts hits a blocked term. */
export async function assertTextAllowed(texts: readonly (string | null | undefined)[]): Promise<void> {
  for (const t of texts) {
    if (!t || t.trim() === '') continue;
    const { error } = await supabase.rpc('check_blocked_terms', { t });
    if (error) throw new Error(isWordFilterError(error) ? TEXT_NOT_ALLOWED : error.message);
  }
}
