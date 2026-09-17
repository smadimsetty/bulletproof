create table sprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  pain_point_id text not null references pain_points(id),
  cycle_number smallint not null,
  started_on date not null,
  status text not null check (status in ('pending_baseline', 'active', 'pending_reassessment', 'completed', 'abandoned')),
  created_at timestamptz not null default now()
);

alter table sprints enable row level security;

create policy owner_read_write_sprints on sprints
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- At most one in-flight sprint per owner -- mirrors sessions_one_active_per_owner
-- in supabase/migrations/20260623145000_expand_sessions.sql.
create unique index sprints_one_in_flight_per_owner
  on sprints (owner_id)
  where (status in ('pending_baseline', 'active', 'pending_reassessment'));
