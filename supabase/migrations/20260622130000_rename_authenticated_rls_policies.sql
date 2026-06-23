-- The previous migration (20260622120000) created these policies with
-- space-separated quoted names, inconsistent with the snake_case convention
-- established in 20260622000809_create_exercises.sql
-- (anon_can_read_exercises). Rename them to snake_case by dropping the
-- old-named policies and recreating them with identical for/using/with
-- check clauses.

drop policy if exists "authenticated read write recovery" on recovery;
drop policy if exists "authenticated read write activity" on activity;
drop policy if exists "authenticated read write sessions" on sessions;
drop policy if exists "authenticated read recommendations" on recommendations;

create policy authenticated_read_write_recovery on recovery
  for all
  to authenticated
  using (true)
  with check (true);

create policy authenticated_read_write_activity on activity
  for all
  to authenticated
  using (true)
  with check (true);

create policy authenticated_read_write_sessions on sessions
  for all
  to authenticated
  using (true)
  with check (true);

create policy authenticated_read_recommendations on recommendations
  for select
  to authenticated
  using (true);
