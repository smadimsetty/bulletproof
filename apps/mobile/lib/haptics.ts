// apps/mobile/lib/haptics.ts
//
// Thin wrappers over expo-haptics that never throw (visual spec 2.6).
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<void>): void {
  try {
    fn().catch(() => {});
  } catch {
    // Haptics unavailable (simulator, web): ignore.
  }
}

export const tap = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const primary = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const select = () => safe(() => Haptics.selectionAsync());
export const rigid = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
export const soft = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
export const heavy = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
export const success = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warning = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const error = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
/** PR celebration: success, then a heavy tap 120 ms later. */
export const pr = () => {
  success();
  setTimeout(heavy, 120);
};
