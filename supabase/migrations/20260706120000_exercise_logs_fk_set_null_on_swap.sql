-- swap_activity.py deletes and recreates today's recommendation_blocks /
-- recommendation_block_exercises rows when the user swaps today's
-- activity. exercise_logs.recommendation_block_exercise_id previously had
-- no ON DELETE behavior (implicit RESTRICT), so swapping after already
-- logging any set today made that delete fail with a foreign-key
-- violation -- the recommendations row's top_pick had already been
-- updated by that point, but the blocks/exercises never got replaced,
-- leaving the Home screen showing stale exercises under the new activity
-- name. exercise_logs.exercise_id (the actual logged exercise) and every
-- other logged column are untouched by this -- only the "which prescribed
-- slot was this for" back-reference is nulled for logs whose block gets
-- swapped away.
alter table exercise_logs
  drop constraint exercise_logs_recommendation_block_exercise_id_fkey;

alter table exercise_logs
  add constraint exercise_logs_recommendation_block_exercise_id_fkey
  foreign key (recommendation_block_exercise_id)
  references recommendation_block_exercises(id)
  on delete set null;
