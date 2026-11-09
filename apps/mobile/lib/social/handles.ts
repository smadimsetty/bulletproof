// apps/mobile/lib/social/handles.ts
//
// Pure handle validation, mirroring the profiles.handle check constraint
// (^[a-z0-9_]{3,20}$). Kept free of native imports so jest can load it.
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export const HANDLE_RULE = '3–20 letters, numbers or _';

/** Trim, lowercase, strip a leading @ (people type it out of habit). */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/** A user-facing problem with the (already normalized) handle, or null if valid. */
export function handleError(h: string): string | null {
  return HANDLE_RE.test(h) ? null : HANDLE_RULE;
}

/** Display names are 1-40 chars (profiles check constraint). */
export function displayNameError(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'Enter a display name.';
  if (n.length > 40) return 'Keep your display name to 40 characters or fewer.';
  return null;
}
