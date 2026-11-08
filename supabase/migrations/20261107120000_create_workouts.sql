-- Sub-project A (logger + history). See
-- docs/superpowers/specs/2026-11-07-logger-history-design.md section 2.
-- Owner policies are named owner_all_<table>; the social sub-project adds
-- separate read policies alongside these and must never edit them.

create table workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  title text not null,
  notes text,
  source text not null check (source in ('empty', 'sprint')),
  sprint_day_id uuid unique references sprint_days(id) on delete set null,
  visibility text not null default 'private'
    check (visibility in ('private', 'followers', 'public')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index workouts_one_in_progress_per_owner
  on workouts (owner_id) where (ended_at is null);
create index workouts_owner_ended_at on workouts (owner_id, ended_at desc);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  sprint_day_exercise_id uuid references sprint_day_exercises(id) on delete set null,
  position smallint not null,
  target_text text,
  measure_rom boolean not null default false,
  notes text
);
create index workout_exercises_workout on workout_exercises (workout_id);
create index workout_exercises_owner_exercise on workout_exercises (owner_id, exercise_id);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number >= 1),
  side text check (side in ('left', 'right')),
  set_type text not null default 'working' check (set_type in ('warmup', 'working')),
  reps smallint check (reps >= 0),
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  duration_s integer check (duration_s >= 0),
  rom_value numeric(6, 2),
  rom_unit text check (rom_unit in ('cm', 'deg', 'in')),
  rpe smallint check (rpe between 1 and 10),
  discomfort smallint check (discomfort between 0 and 10),
  completed_at timestamptz
);
create index workout_sets_exercise on workout_sets (workout_exercise_id);

alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sets enable row level security;

create policy owner_all_workouts on workouts
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all_workout_exercises on workout_exercises
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all_workout_sets on workout_sets
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
