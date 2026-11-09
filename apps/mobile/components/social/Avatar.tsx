// apps/mobile/components/social/Avatar.tsx
//
// Round avatar from a private-bucket signed URL, with an initials fallback
// (also shown while loading or if the image fails).
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../lib/theme';
import { useSignedUrl } from '../../lib/social/useSignedUrl';

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export default function Avatar({
  path,
  name,
  size = 40,
  localUri,
}: {
  path: string | null | undefined;
  name: string;
  size?: number;
  /** A just-picked local image, shown before it has been uploaded. */
  localUri?: string | null;
}) {
  const signed = useSignedUrl('avatars', localUri ? null : path);
  const [failed, setFailed] = useState(false);
  const uri = localUri ?? signed;
  useEffect(() => setFailed(false), [uri]);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.image, box]} onError={() => setFailed(true)} accessibilityLabel={`${name} avatar`} />;
  }
  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: COLORS.accentMuted },
  fallback: { backgroundColor: COLORS.accentMuted, alignItems: 'center', justifyContent: 'center' },
  initials: { color: COLORS.accent, fontWeight: '700' },
});
