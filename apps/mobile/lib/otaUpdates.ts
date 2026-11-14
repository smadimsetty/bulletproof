// Over-the-air (EAS Update) handling.
//
// expo-updates already downloads a new update on cold launch and applies it on
// the next cold launch. iPhones rarely cold-launch an app, so we also check when
// the app comes back to the foreground and reload into the new bundle, but only
// at a moment where a reload can't interrupt anything (no workout in progress,
// not on the logger or the hang timer).
import * as Updates from 'expo-updates';

export const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Screens where a sudden reload would interrupt a timer, a purchase, or half-typed input. */
const BUSY_PATH_PREFIXES = ['/workout/', '/hang', '/sprint', '/paywall', '/onboarding', '/edit-profile'];

export function isSafeToReload(opts: { pathname: string; hasActiveWorkout: boolean }): boolean {
  if (opts.hasActiveWorkout) return false;
  return !BUSY_PATH_PREFIXES.some((p) => opts.pathname === p || opts.pathname.startsWith(p));
}

export function shouldCheckNow(lastCheckMs: number | null, nowMs: number): boolean {
  return lastCheckMs === null || nowMs - lastCheckMs >= MIN_CHECK_INTERVAL_MS;
}

let lastCheckMs: number | null = null;
let inFlight = false;

/**
 * Checks for an update and, if one is available and `isSafe()` still holds once
 * it has downloaded, reloads into it. Never throws; a no-op in development builds.
 */
export async function applyUpdateIfSafe(isSafe: () => Promise<boolean>): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || inFlight) return;
  const now = Date.now();
  if (!shouldCheckNow(lastCheckMs, now)) return;
  lastCheckMs = now;
  inFlight = true;
  try {
    if (!(await isSafe())) return;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    // Re-check: the user may have started a workout while it downloaded.
    if (fetched.isNew && (await isSafe())) await Updates.reloadAsync();
  } catch (err) {
    console.warn('OTA update check failed:', err);
  } finally {
    inFlight = false;
  }
}
