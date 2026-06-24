-- Addresses two findings from the schema-v2 whole-branch Critic review
-- (.superpowers/sdd/schema-v2-final-review.md):
--
-- 1. Every new RLS policy filters on `owner_id = auth.uid()`, but no index
--    backs that column on any per-user table. Invisible at today's
--    single-user/~700-row scale; will matter the moment a second real user
--    exists. Add a plain btree index per table.
-- 2. The one real `user_profile.pains` row collapsed "hips" and
--    "hamstrings" into a single entry (`body_part: "hips"`, note
--    "...also covers hamstrings)"), even though `body_part_taxonomy` seeds
--    them as two distinct rows. Split into two entries so taxonomy-keyed
--    queries (e.g. "rehab work for hamstrings") actually find this pain.

create index if not exists recovery_owner_id_idx on public.recovery (owner_id);
create index if not exists activity_owner_id_idx on public.activity (owner_id);
create index if not exists sessions_owner_id_idx on public.sessions (owner_id);
create index if not exists recommendations_owner_id_idx on public.recommendations (owner_id);
create index if not exists user_profile_owner_id_idx on public.user_profile (owner_id);
create index if not exists exercise_logs_owner_id_idx on public.exercise_logs (owner_id);
create index if not exists daily_feedback_owner_id_idx on public.daily_feedback (owner_id);

update public.user_profile
set pains = (
  select jsonb_agg(expanded.value)
  from jsonb_array_elements(pains) as entry
  cross join lateral (
    select case
      when entry->>'body_part' = 'hips' then
        entry || jsonb_build_object('note', 'wants better mobility: deep squat, down dog, flexibility poses')
      else entry
    end as value
    union all
    select jsonb_build_object(
      'body_part', 'hamstrings',
      'severity', entry->'severity',
      'note', 'wants better mobility: deep squat, down dog, flexibility poses',
      'since', entry->'since'
    )
    where entry->>'body_part' = 'hips'
  ) as expanded
)
where pains @> '[{"body_part": "hips"}]'::jsonb;
