// apps/mobile/lib/social/useSignedUrl.ts
import { useEffect, useState } from 'react';
import { signedUrl } from './images';

/** Signed URL for a private-bucket image; null while loading, missing, or on failure. */
export function useSignedUrl(bucket: 'workout-media' | 'avatars', path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path) return;
    signedUrl(bucket, path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [bucket, path]);
  return url;
}
