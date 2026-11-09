// apps/mobile/lib/social/imageSizing.ts
//
// Pure sizing/path helpers for uploads (no native imports, so jest can load them).

/** Scale (w, h) down so the long edge is at most `maxEdge`; never upscales. */
export function resizeTarget(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= maxEdge || long <= 0) return { width: w, height: h };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** workout-media/<owner>/<workout>/<id>.jpg -- the bucket's first folder must be the owner id. */
export function workoutMediaPath(ownerId: string, workoutId: string, id: string): string {
  return `${ownerId}/${workoutId}/${id}.jpg`;
}

/** avatars/<owner>/<id>.jpg */
export function avatarPath(ownerId: string, id: string): string {
  return `${ownerId}/${id}.jpg`;
}

/** Hermes doesn't guarantee crypto.randomUUID; uniqueness only needs to be per-user. */
export function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
