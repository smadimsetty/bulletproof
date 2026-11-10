// apps/mobile/lib/exerciseCue.ts
//
// The one-line "what to do" text behind the eye icon. Global exercises use
// their `cue`; a user's own custom exercise has no cue, so it falls back to
// the description they wrote themselves.
export function eyeCue(row: { cue?: string | null; description?: string | null; owner_id?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return row.cue ?? (row.owner_id ? row.description ?? null : null);
}
