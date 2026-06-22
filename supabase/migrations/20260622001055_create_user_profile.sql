create table user_profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goals jsonb not null default '{}'::jsonb,
  injury_constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

-- Deliberately no anon/authenticated policies: goals and injury notes are
-- personal and are only ever read/written server-side via the service role,
-- which bypasses RLS by design.
