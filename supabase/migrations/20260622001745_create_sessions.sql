create table sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type session_type not null,
  recommendation_id uuid references recommendations(id) on delete set null,
  duration_minutes integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;

-- Deliberately no anon/authenticated policies: this is your confirmed
-- training history, part of the private dashboard only.
