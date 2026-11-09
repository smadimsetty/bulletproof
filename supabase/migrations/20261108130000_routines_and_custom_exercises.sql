-- Stage 2 (routines + exercise library). See
-- docs/superpowers/plans/2026-11-08-stage2-routines-library.md Task 1.
-- Additive: custom exercises (exercises.owner_id), routine folders/routines/
-- routine_exercises, workouts.routine_id. Every child table gets a
-- parent-ownership WITH CHECK because FK checks bypass RLS (see
-- 20261107130000_workouts_parent_ownership_checks.sql).

-- ---- exercises: custom rows + tighter read RLS ---------------------------

alter table exercises
  add column owner_id uuid references auth.users(id) on delete cascade,
  add column cloned_from_exercise_id uuid references exercises(id) on delete set null,
  add column description text;
create index exercises_owner on exercises (owner_id);

-- Global rows keep owner_id null. Custom rows must never be readable by anon
-- or by another user, so the old using (true) policies are replaced.
drop policy anon_can_read_exercises on exercises;
drop policy authenticated_read_exercises on exercises;

create policy anon_read_global_exercises on exercises
  for select to anon
  using (owner_id is null);
create policy authenticated_read_exercises on exercises
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
-- No default auth.uid() on owner_id: global seed inserts must stay global,
-- so the client passes owner_id explicitly (and this policy enforces it).
create policy owner_write_exercises on exercises
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---- routine tables ------------------------------------------------------

create table routine_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Deleting a folder moves its routines to Unfiled rather than deleting them.
  folder_id uuid references routine_folders(id) on delete set null,
  title text not null check (length(title) between 1 and 80),
  notes text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table routine_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position smallint not null,
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  target_reps smallint,
  target_duration_s integer,
  target_weight_kg numeric(6, 2),
  rest_s smallint check (rest_s between 0 and 600),
  notes text
);

create index routines_owner on routines (owner_id);
create index routine_exercises_routine on routine_exercises (routine_id);
create index routine_folders_owner on routine_folders (owner_id);

alter table routine_folders enable row level security;
alter table routines enable row level security;
alter table routine_exercises enable row level security;

create policy owner_all_routine_folders on routine_folders
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy owner_all_routines on routines
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      folder_id is null
      or exists (
        select 1 from routine_folders f
        where f.id = routines.folder_id and f.owner_id = auth.uid()
      )
    )
  );

create policy owner_all_routine_exercises on routine_exercises
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from routines r
      where r.id = routine_exercises.routine_id and r.owner_id = auth.uid()
    )
    and exists (
      select 1 from exercises e
      where e.id = routine_exercises.exercise_id
        and (e.owner_id is null or e.owner_id = auth.uid())
    )
  );

-- ---- workouts: routine link + wider source -------------------------------

alter table workouts add column routine_id uuid references routines(id) on delete set null;

-- The inline check from create_workouts is auto-named workouts_source_check.
alter table workouts drop constraint workouts_source_check;
alter table workouts add constraint workouts_source_check
  check (source in ('empty', 'sprint', 'routine', 'copy'));

-- Restrictive policies AND with owner_all_*; split per command because a
-- FOR ALL restrictive policy with only WITH CHECK would leave USING ambiguous
-- for select/delete. Reads/deletes are unaffected.
create policy workouts_routine_owned_ins on workouts
  as restrictive for insert to authenticated
  with check (
    routine_id is null
    or exists (select 1 from routines r where r.id = workouts.routine_id and r.owner_id = auth.uid())
  );
create policy workouts_routine_owned_upd on workouts
  as restrictive for update to authenticated
  using (true)
  with check (
    routine_id is null
    or exists (select 1 from routines r where r.id = workouts.routine_id and r.owner_id = auth.uid())
  );

-- A workout may only reference exercises the caller can read (global or own).
create policy workout_exercises_exercise_readable_ins on workout_exercises
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from exercises e
      where e.id = workout_exercises.exercise_id
        and (e.owner_id is null or e.owner_id = auth.uid())
    )
  );
create policy workout_exercises_exercise_readable_upd on workout_exercises
  as restrictive for update to authenticated
  using (true)
  with check (
    exists (
      select 1 from exercises e
      where e.id = workout_exercises.exercise_id
        and (e.owner_id is null or e.owner_id = auth.uid())
    )
  );
