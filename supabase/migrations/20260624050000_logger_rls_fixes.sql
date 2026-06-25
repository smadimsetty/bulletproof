-- supabase/migrations/20260624050000_logger_rls_fixes.sql
--
-- Two RLS gaps found while building the Logger screen (Phase 6), both
-- confirmed by reading the live policy definitions directly rather than
-- assuming write access mirrors read access:
--
-- 1. `exercises` (20260622000809_create_exercises.sql) grants `select`
--    only to the `anon` role, never `authenticated`. Postgres RLS
--    policies are role-scoped via `to <role>` -- an authenticated
--    request does not inherit an anon-scoped policy. Every signed-in
--    mobile-app request is `authenticated`, not `anon`, so the Logger's
--    catalog browse ("+ Add an exercise") and swap-eligible-exercise
--    queries would silently return zero rows without this fix (RLS
--    filters rows out with no error -- this also retroactively explains
--    why Phase 5's `recommendation_block_exercises -> exercises` nested
--    join should have been returning null exercise fields under strict
--    RLS enforcement for a signed-in user).
-- 2. `recommendation_block_exercises` (20260623145500_multi_user_rls.sql)
--    has only a `select` policy (`owner_read_recommendation_block_
--    exercises`). Swap/remove/add in this phase need insert/update/
--    delete, which has no policy at all today -- every such write would
--    be silently rejected by RLS.
--
-- Both new policies reuse the exact ownership-chain shape the existing
-- select policy already established (recommendation_block_exercises ->
-- recommendation_blocks -> recommendations.owner_id), just extended to
-- the write commands.

create policy authenticated_read_exercises on exercises
  for select
  to authenticated
  using (true);

create policy owner_write_recommendation_block_exercises on recommendation_block_exercises
  for all
  to authenticated
  using (
    exists (
      select 1 from recommendation_blocks b
      join recommendations r on r.id = b.recommendation_id
      where b.id = recommendation_block_exercises.block_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from recommendation_blocks b
      join recommendations r on r.id = b.recommendation_id
      where b.id = recommendation_block_exercises.block_id
        and r.owner_id = auth.uid()
    )
  );
