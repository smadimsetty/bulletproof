-- Supports the ad-hoc "+" workout flow: a freeform session not tied to
-- any recommendation_blocks row. The picked catalog exercise ids for
-- such a session live here (rather than as fake recommendation_blocks
-- rows) so the ad-hoc Logger screen can rebuild its exercise list after
-- an app close/reopen or deep link.
alter table sessions add column ad_hoc_exercise_ids uuid[] not null default '{}'::uuid[];
