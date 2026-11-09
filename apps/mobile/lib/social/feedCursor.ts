// apps/mobile/lib/social/feedCursor.ts
//
// Keyset paging helpers for the feed (ordered by ended_at desc, id desc).
// Pure, so jest can load it without Supabase.
export interface FeedCursor {
  endedAt: string;
  id: string;
}

/** PostgREST .or() filter for "rows strictly after this cursor" in (ended_at desc, id desc) order. */
export function feedCursorFilter(c: FeedCursor): string {
  return `ended_at.lt.${c.endedAt},and(ended_at.eq.${c.endedAt},id.lt.${c.id})`;
}

/**
 * The cursor for the next page, or null when this page was short (no more rows).
 * A full page may still be the last one; the next fetch then returns [] and ends it.
 */
export function nextCursor(page: readonly { endedAt: string; id: string }[], limit: number): FeedCursor | null {
  if (page.length < limit || page.length === 0) return null;
  const last = page[page.length - 1];
  return { endedAt: last.endedAt, id: last.id };
}
