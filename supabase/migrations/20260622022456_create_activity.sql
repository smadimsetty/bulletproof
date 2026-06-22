create table activity (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  activity_score smallint check (activity_score between 0 and 100),
  total_calories integer,
  active_calories integer,
  steps integer,
  high_activity_time integer,
  medium_activity_time integer,
  low_activity_time integer,
  sedentary_time integer,
  workout_count integer not null default 0,
  workouts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table activity enable row level security;

-- Deliberately no anon/authenticated policies: daily activity detail is as
-- personal as recovery data and is service-role-only, same as recovery.

create trigger set_updated_at_activity
  before update on activity
  for each row
  execute function set_updated_at();
