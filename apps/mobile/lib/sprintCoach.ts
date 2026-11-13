// apps/mobile/lib/sprintCoach.ts
//
// Fire-and-forget calls to the sprint-coach Edge Function (spec 2026-11-12
// §5.4, §8a.4): the app never waits on Claude. Results land in Postgres
// (sprint_ai_adjustments, sprints.ai_summary / retest_recommendation) and are
// picked up the next time a day is built or the sprint screen loads; a failure
// simply leaves the rules in charge.
import { supabase } from './supabase';

export type CoachTrigger = 'start' | 'pain' | 'retest';

export function requestCoach(trigger: CoachTrigger, sprintId: string): void {
  try {
    Promise.resolve(supabase.functions.invoke('sprint-coach', { body: { trigger, sprintId } })).catch(() => {});
  } catch {
    // never surfaces to the caller
  }
}
