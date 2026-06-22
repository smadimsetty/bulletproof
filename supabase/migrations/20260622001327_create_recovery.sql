create table recovery (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  source text not null default 'oura' check (source in ('oura', 'manual')),
  sleep_hrs numeric(4, 2),
  hrv numeric(6, 2),
  resting_hr numeric(5, 2),
  subjective_readiness smallint check (subjective_readiness between 1 and 10),
  soreness_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recovery enable row level security;

-- Deliberately no anon/authenticated policies: raw biometrics are exactly
-- the data the public/private split exists to protect.
