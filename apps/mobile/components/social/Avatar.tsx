// apps/mobile/components/social/Avatar.tsx
//
// Avatar from a private-bucket signed URL (or a just-picked local image), built on the
// shared ui Avatar so the initials fallback / fade-in match everywhere. Accepts the
// design-system size keys or a legacy pixel size (mapped to the nearest key).
import { useSignedUrl } from '../../lib/social/useSignedUrl';
import { Avatar as UiAvatar, type AvatarProps } from '../ui';

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

type SizeKey = NonNullable<AvatarProps['size']>;

function sizeKey(size: number | SizeKey): SizeKey {
  if (typeof size !== 'number') return size;
  if (size <= 28) return 'xs';
  if (size <= 38) return 'sm';
  if (size <= 58) return 'md';
  if (size <= 84) return 'lg';
  return 'xl';
}

export default function Avatar({
  path,
  name,
  size = 'md',
  localUri,
  ring,
}: {
  path: string | null | undefined;
  name: string;
  size?: number | SizeKey;
  /** A just-picked local image, shown before it has been uploaded. */
  localUri?: string | null;
  ring?: boolean;
}) {
  const signed = useSignedUrl('avatars', localUri ? null : path);
  return <UiAvatar uri={localUri ?? signed} name={name} size={sizeKey(size)} ring={ring} />;
}
