// apps/mobile/lib/dailyFeedback.ts
//
// Writes one daily_feedback row. This is a plain insert, not an upsert --
// daily_feedback has no unique constraint on (owner_id, date) (confirmed
// by reading supabase/migrations/20260623144500_create_exercise_logs_and_
// daily_feedback.sql), so multiple feedback entries per day are a valid,
// intended shape rather than something to dedupe client-side. `owner_id`
// defaults to auth.uid() at the database level, so it's never set here.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';

export async function submitDailyFeedback(today: Date, feedbackText: string): Promise<void> {
  const trimmed = feedbackText.trim();
  if (trimmed === '') {
    throw new Error('Feedback cannot be empty.');
  }

  const { error } = await supabase
    .from('daily_feedback')
    .insert({ date: localDateString(today), feedback_text: trimmed });

  if (error) {
    throw new Error(error.message);
  }
}
