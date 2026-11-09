// apps/mobile/lib/social/followState.ts
//
// Pure follow-UI decisions (no native imports, so jest can load them).
import type { FollowStatus } from './profiles';

export type FollowLabel = 'Follow' | 'Follow back' | 'Requested' | 'Following';

export function followButtonLabel(status: FollowStatus, followsMe: boolean): FollowLabel {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return followsMe ? 'Follow back' : 'Follow';
}

/**
 * Makes user text safe inside a PostgREST `.or()` filter and an ilike
 * pattern: commas/parens would break the filter grammar, % and * act as
 * wildcards, backslash escapes. Whitespace collapses; the result may be empty.
 */
export function sanitizeSearchQuery(q: string): string {
  return q.replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim();
}
