create table sprint_days (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 14),
  date date not null,
  completed_at timestamptz,
  unique (sprint_id, day_number)
);

alter table sprint_days enable row level security;

create policy owner_read_write_sprint_days on sprint_days
  for all
  to authenticated
  using (exists (select 1 from sprints s where s.id = sprint_days.sprint_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sprints s where s.id = sprint_days.sprint_id and s.owner_id = auth.uid()));

create table sprint_day_exercises (
  id uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references sprint_days(id) on delete cascade,
  slot_key text not null,
  tier smallint not null check (tier in (1, 2)),
  exercise_id uuid not null references exercises(id),
  prescribed_sets smallint,
  prescribed_reps_or_duration text,
  exercise_order smallint not null,
  swapped_from_exercise_id uuid references exercises(id),
  completed_at timestamptz
);

alter table sprint_day_exercises enable row level security;

create policy owner_read_write_sprint_day_exercises on sprint_day_exercises
  for all
  to authenticated
  using (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_exercises.sprint_day_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_exercises.sprint_day_id and s.owner_id = auth.uid()
    )
  );
