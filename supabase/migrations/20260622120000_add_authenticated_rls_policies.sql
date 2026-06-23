-- Single-user app: any authenticated session gets full read/write on
-- recovery/activity/sessions and read-only on recommendations. There's
-- exactly one real account right now, so there's no per-row ownership
-- column yet — revisit with an owner_id column + scoped policies once a
-- second user actually exists (see CLAUDE.md's multi-user principle).

create policy "authenticated read write recovery" on recovery
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read write activity" on activity
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read write sessions" on sessions
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated read recommendations" on recommendations
  for select
  to authenticated
  using (true);
