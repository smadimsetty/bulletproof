-- Dead hang timer: one row per hang, logged from the standalone timer (not part of a
-- workout or sprint). Owner-only; no FK to a parent row, so no parent-ownership check.
create table hangs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  started_at timestamptz not null,
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 3600000),
  -- 'free' = stopwatch, stopped by hand; 'interval' = counts down from target_ms.
  mode text not null check (mode in ('free', 'interval')),
  target_ms integer check (target_ms is null or target_ms > 0),
  created_at timestamptz not null default now()
);

create index hangs_owner_started on hangs (owner_id, started_at desc);

alter table hangs enable row level security;

create policy owner_all_hangs on hangs
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
