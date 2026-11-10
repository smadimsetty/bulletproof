// apps/mobile/lib/timerAlerts.ts
//
// Audible alerts when a logger timer (hold, switch sides, rest) ends:
//  - playTimerEnd(): a short beep through expo-audio. Plays on the silent
//    switch and ducks (does not stop) music.
//  - scheduleTimerEndNotification(): a local notification with sound at the
//    deadline, for when the phone is locked or the app is backgrounded and
//    JS is not running. The foreground notification handler (lib/social/push.ts)
//    hides its banner because playTimerEnd already made the sound.
// Everything here is best effort and never throws.
import * as Notifications from 'expo-notifications';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Marker on the notification's data so the foreground handler can recognise it. */
export const TIMER_END_KIND = 'timer_end';

let player: AudioPlayer | null = null;

export async function initTimerAudio(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  } catch {
    // Audio is optional.
  }
}

export function playTimerEnd(): void {
  try {
    if (!player) {
      // Lazy require: keeps the asset out of Jest's way and defers loading until first use.
      player = createAudioPlayer(require('../assets/sounds/timer-end.wav'));
    }
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    player = null;
  }
}

let permissionAsked = false;

/** Asks for notification permission once per session if it has not been decided yet (no push registration). */
async function ensureNotificationPermission(): Promise<void> {
  if (permissionAsked) return;
  permissionAsked = true;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'undetermined') await Notifications.requestPermissionsAsync();
  } catch {
    // Best effort.
  }
}

/** Schedules the lock-screen alert for `endsAtMs`. Null when already past or on failure. */
export async function scheduleTimerEndNotification(endsAtMs: number, body: string): Promise<string | null> {
  if (!(endsAtMs > Date.now())) return null;
  await ensureNotificationPermission();
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Bulletproof', body, sound: 'default', data: { kind: TIMER_END_KIND } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAtMs) },
    });
  } catch {
    return null;
  }
}

export async function cancelTimerEndNotification(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or gone.
  }
}
