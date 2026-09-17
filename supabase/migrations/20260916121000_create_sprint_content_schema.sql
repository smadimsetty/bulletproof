create table sprint_exercise_pool (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  tier smallint not null check (tier in (1, 2)),
  slot_key text not null,
  exercise_id uuid not null references exercises(id),
  default_rank smallint not null,
  prescribed_sets smallint,
  prescribed_reps_or_duration text,
  created_at timestamptz not null default now()
);

alter table sprint_exercise_pool enable row level security;

create policy authenticated_read_sprint_exercise_pool on sprint_exercise_pool
  for select
  to authenticated
  using (true);

create index sprint_exercise_pool_slot_idx on sprint_exercise_pool (pain_point_id, slot_key);

create table sprint_day_template (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  day_number smallint not null check (day_number between 1 and 14),
  slot_key text not null,
  tier smallint not null check (tier in (1, 2)),
  slot_order smallint not null
);

alter table sprint_day_template enable row level security;

create policy authenticated_read_sprint_day_template on sprint_day_template
  for select
  to authenticated
  using (true);

create index sprint_day_template_day_idx on sprint_day_template (pain_point_id, day_number);

create table assessment_definitions (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  test_key text not null,
  name text not null,
  instructions text not null,
  unit text not null,
  target_description text not null,
  better_direction text not null check (better_direction in ('lower', 'higher', 'symmetry')),
  is_bilateral boolean not null default true,
  is_synthesized boolean not null default false,
  sort_order smallint not null,
  unique (pain_point_id, test_key)
);

alter table assessment_definitions enable row level security;

create policy authenticated_read_assessment_definitions on assessment_definitions
  for select
  to authenticated
  using (true);
