create table recommendations (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  top_pick session_type not null,
  runner_up session_type,
  score_breakdown jsonb not null default '{}'::jsonb,
  internal_rationale text not null,
  public_rationale text not null,
  generated_at timestamptz not null default now()
);

alter table recommendations enable row level security;

-- Deliberately no anon/authenticated policies on the base table:
-- score_breakdown and internal_rationale can reference raw biometrics.
-- Public access goes through the view below instead.

-- Views in Postgres run with the privileges of their owner (the migration
-- role, which bypasses RLS), not the querying role. That means this view
-- can read the protected base table while only ever exposing the four
-- columns listed here — the base table's RLS still blocks any other path.
create view recommendations_public as
  select date, top_pick, runner_up, public_rationale, generated_at
  from recommendations;

grant select on recommendations_public to anon, authenticated;
