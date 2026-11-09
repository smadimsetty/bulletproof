// apps/mobile/lib/social/visibility.ts
//
// Pure rules for the post-visibility picker (no native imports).
import type { Visibility } from '../userSettings';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'followers', label: 'Followers' },
  { value: 'public', label: 'Public' },
];

export const PUBLIC_DISABLED_HINT = 'Make your profile public in Settings to post publicly';

/**
 * What the Finish sheet starts on. Sprint workouts reveal a health issue, so
 * they default to Private; others use the user's default. Public is only
 * allowed when the profile is public, so it degrades to Followers.
 */
export function initialVisibility(isSprint: boolean, userDefault: Visibility, profileIsPublic: boolean): Visibility {
  if (isSprint) return 'private';
  if (userDefault === 'public' && !profileIsPublic) return 'followers';
  return userDefault;
}

export function visibilityLabel(v: Visibility): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
