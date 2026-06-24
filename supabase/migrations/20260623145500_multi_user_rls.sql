alter table recovery add column owner_id uuid references auth.users(id);

update recovery
set owner_id = '89ac801b-5515-4388-80a7-03662030c487'
where owner_id is null;

alter table recovery
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

alter table activity add column owner_id uuid references auth.users(id);

update activity
set owner_id = '89ac801b-5515-4388-80a7-03662030c487'
where owner_id is null;

alter table activity
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

drop policy if exists authenticated_read_write_recovery on recovery;
drop policy if exists authenticated_read_write_activity on activity;
drop policy if exists authenticated_read_write_sessions on sessions;
drop policy if exists authenticated_read_recommendations on recommendations;

create policy owner_read_write_user_profile on user_profile
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_write_recovery on recovery
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_write_activity on activity
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_write_sessions on sessions
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_recommendations on recommendations
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy owner_read_write_exercise_logs on exercise_logs
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_write_daily_feedback on daily_feedback
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy owner_read_recommendation_blocks on recommendation_blocks
  for select
  to authenticated
  using (
    exists (
      select 1 from recommendations r
      where r.id = recommendation_blocks.recommendation_id
        and r.owner_id = auth.uid()
    )
  );

create policy owner_read_recommendation_block_exercises on recommendation_block_exercises
  for select
  to authenticated
  using (
    exists (
      select 1 from recommendation_blocks b
      join recommendations r on r.id = b.recommendation_id
      where b.id = recommendation_block_exercises.block_id
        and r.owner_id = auth.uid()
    )
  );
