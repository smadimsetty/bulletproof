// apps/mobile/lib/social/images.ts
//
// Native-side image pipeline: resize + JPEG-compress a picked image, upload it
// to a private bucket, and mint cached signed URLs for reading. Buckets are
// private and every read goes through a signed URL (never a public URL).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../supabase';
import { resizeTarget } from './imageSizing';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

/** Resize so the long edge is <= maxEdge, then JPEG at the given quality. */
export async function prepareJpeg(uri: string, maxEdge: number, compress = 0.8): Promise<PreparedImage> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const target = resizeTarget(probe.width, probe.height, maxEdge);
  const ctx = ImageManipulator.manipulate(probe);
  if (target.width !== probe.width || target.height !== probe.height) ctx.resize(target);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Uploads a local file URI to `bucket/path` as image/jpeg. Throws on failure. */
export async function uploadLocalJpeg(bucket: 'workout-media' | 'avatars', path: string, localUri: string): Promise<void> {
  const res = await fetch(localUri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
}

const SIGN_SECONDS = 3600;
const REFRESH_BEFORE_MS = 5 * 60 * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();

/** Signed read URL, cached in memory until 5 minutes before it expires. */
export async function signedUrl(bucket: 'workout-media' | 'avatars', path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt - REFRESH_BEFORE_MS > Date.now()) return hit.url;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGN_SECONDS);
    if (error || !data) throw new Error(error?.message ?? 'Could not load image.');
    cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGN_SECONDS * 1000 });
    return data.signedUrl;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** Drop cached URLs for a path (after replacing/removing an image). */
export function forgetSignedUrl(bucket: 'workout-media' | 'avatars', path: string): void {
  cache.delete(`${bucket}/${path}`);
}
