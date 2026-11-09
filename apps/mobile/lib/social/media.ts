// apps/mobile/lib/social/media.ts
//
// Workout photos: up to 4 per workout, resized to a 1080px long edge and
// JPEG-compressed, stored at workout-media/<owner>/<workout>/<id>.jpg (the
// first folder MUST be the owner id -- storage RLS and the workout_media
// check constraint both depend on it). Reads go through signed URLs.
import { supabase } from '../supabase';
import { getMyId } from '../session';
import { prepareJpeg, uploadLocalJpeg, forgetSignedUrl } from './images';
import { randomId, workoutMediaPath } from './imageSizing';

export const MAX_PHOTOS = 4;
const MAX_EDGE = 1080;

export interface UploadResult {
  uploaded: number;
  failed: number;
}

/**
 * Uploads photos one by one so a single failure only loses that photo.
 * `startPosition` is the position of the first new photo (existing count when
 * adding to a saved workout). Never throws for per-photo failures.
 */
export async function uploadWorkoutPhotos(
  workoutId: string,
  localUris: readonly string[],
  startPosition = 0
): Promise<UploadResult> {
  const me = await getMyId();
  let uploaded = 0;
  let failed = 0;
  for (let i = 0; i < localUris.length; i++) {
    const path = workoutMediaPath(me, workoutId, randomId());
    try {
      const prepared = await prepareJpeg(localUris[i], MAX_EDGE);
      await uploadLocalJpeg('workout-media', path, prepared.uri);
      const { error } = await supabase.from('workout_media').insert({
        workout_id: workoutId,
        path,
        position: startPosition + i,
        width: prepared.width,
        height: prepared.height,
      });
      if (error) {
        // Don't leave an unreferenced object behind.
        await supabase.storage.from('workout-media').remove([path]).catch(() => undefined);
        throw new Error(error.message);
      }
      uploaded++;
    } catch (err) {
      console.warn('Photo upload failed:', err);
      failed++;
    }
  }
  return { uploaded, failed };
}

export async function removeWorkoutPhoto(media: { id: string; path: string }): Promise<void> {
  const { error } = await supabase.from('workout_media').delete().eq('id', media.id);
  if (error) throw new Error(error.message);
  forgetSignedUrl('workout-media', media.path);
  // Best effort: an orphaned object is invisible (no row references it).
  await supabase.storage.from('workout-media').remove([media.path]).catch(() => undefined);
}

/** User-facing summary for the "some photos didn't upload" alert, or null if all went through. */
export function photoFailureMessage(failed: number): string | null {
  if (failed <= 0) return null;
  return `Saved, but ${failed} photo${failed === 1 ? '' : 's'} didn't upload — add ${failed === 1 ? 'it' : 'them'} from the workout.`;
}
