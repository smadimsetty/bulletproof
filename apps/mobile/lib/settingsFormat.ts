// apps/mobile/lib/settingsFormat.ts
//
// Pure text helpers for the Settings screen.

/** "Signed in with Apple" / "Signed in as <email>" from the Supabase auth provider. */
export function accountLabel(provider: string | undefined, email: string | undefined): string {
  if (provider === 'apple') return 'Signed in with Apple';
  if (email) return `Signed in as ${email}`;
  return 'Signed in';
}

/** The delete-account confirmation requires typing DELETE exactly (case-sensitive, trimmed). */
export function canConfirmDelete(typed: string): boolean {
  return typed.trim() === 'DELETE';
}
