// apps/mobile/lib/swapTrigger.ts
//
// Fires the trigger-swap-activity Supabase Edge Function, which dispatches
// swap-activity.yml on demand for the given date/activity. Same
// fire-and-forget, fail-soft posture as engineTrigger.ts -- a failed
// trigger just means the swap sheet's "Swapping..." state should surface
// an error rather than blocking anything else on screen.
import { supabase } from './supabase';
import type { SessionType } from './recommendations';

export async function triggerSwapActivity(dateIso: string, activity: SessionType): Promise<boolean> {
  const { error } = await supabase.functions.invoke('trigger-swap-activity', {
    body: { date: dateIso, activity },
  });
  if (error) {
    console.warn('Failed to trigger activity swap:', error.message);
    return false;
  }
  return true;
}
