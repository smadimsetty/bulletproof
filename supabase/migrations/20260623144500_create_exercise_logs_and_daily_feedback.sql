create table exercise_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  recommendation_block_exercise_id uuid references recommendation_block_exercises(id),
  exercise_id uuid not null references exercises(id),
  block_type session_type not null,
  completed boolean not null default false,
  set_number smallint,
  reps_completed smallint,
  weight_kg numeric(6, 2),
  rpe smallint check (rpe between 1 and 10),
  logged_at timestamptz not null default now(),
  notes text
);

alter table exercise_logs enable row level security;

create table daily_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  feedback_text text not null,
  created_at timestamptz not null default now()
);

alter table daily_feedback enable row level security;
