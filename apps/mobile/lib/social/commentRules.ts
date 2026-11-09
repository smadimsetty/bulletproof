// apps/mobile/lib/social/commentRules.ts
export const COMMENT_MAX = 500;

/** A problem with the draft, or null if it can be posted. */
export function commentError(body: string): string | null {
  const t = body.trim();
  if (t.length === 0) return 'Write something first.';
  if (t.length > COMMENT_MAX) return `Keep comments to ${COMMENT_MAX} characters or fewer.`;
  return null;
}
