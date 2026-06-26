// apps/mobile/lib/engineTrigger.ts
//
// Fires the trigger-daily-engine Supabase Edge Function, which dispatches
// the existing daily-cron.yml GitHub Actions workflow on demand. See
// docs/superpowers/specs/2026-06-26-on-demand-recommendation-trigger-design.md.
// Fire-and-forget and fail-soft, same posture as healthkitSync.ts -- a
// failed trigger just means the Home screen keeps its existing
// "hasn't generated yet" state rather than blocking anything.
import { supabase } from './supabase';

export async function triggerDailyEngine(): Promise<boolean> {
  const { error } = await supabase.functions.invoke('trigger-daily-engine');
  if (error) {
    console.warn('Failed to trigger on-demand recommendation generation:', error.message);
    return false;
  }
  return true;
}
