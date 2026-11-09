// apps/mobile/components/social/SignedImage.tsx
//
// An image from a private bucket, loaded through a cached signed URL, with a
// neutral placeholder while loading / on failure.
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS } from '../../lib/theme';
import { useSignedUrl } from '../../lib/social/useSignedUrl';

export default function SignedImage({
  bucket = 'workout-media',
  path,
  style,
  resizeMode = 'cover',
}: {
  bucket?: 'workout-media' | 'avatars';
  path: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'cover' | 'contain';
}) {
  const url = useSignedUrl(bucket, path);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <View style={[styles.placeholder, style]} />;
  return <Image source={{ uri: url }} style={style as any} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: COLORS.elevated },
});
