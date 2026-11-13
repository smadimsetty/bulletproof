-- Adaptive sprint engine schema. Spec: docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md
-- Every table that references a parent row carries a parent-ownership check in its
-- policy (FK checks bypass RLS; see 20261107130000_workouts_parent_ownership_checks.sql).

-- ---------------------------------------------------------------- assessment definitions
alter table assessment_definitions
  add column if not exists raw_direction text,
  add column if not exists target_value numeric,
  add column if not exists noise_threshold numeric;

do $$ begin
  alter table assessment_definitions
    add constraint assessment_definitions_raw_direction_check
    check (raw_direction in ('higher', 'lower'));
exception when duplicate_object then null; end $$;

update assessment_definitions
   set raw_direction = better_direction
 where better_direction in ('higher', 'lower') and raw_direction is null;

-- ---------------------------------------------------------------- global content tables
create table if not exists sprint_slots (
  pain_point_id text not null references pain_points(id),
  slot_key text not null,
  area text not null,
  is_stretch boolean not null default false,
  primary key (pain_point_id, slot_key)
);
alter table sprint_slots enable row level security;
drop policy if exists authenticated_read_sprint_slots on sprint_slots;
create policy authenticated_read_sprint_slots on sprint_slots
  for select to authenticated using (true);

create table if not exists assessment_slot_links (
  pain_point_id text not null references pain_points(id),
  test_key text not null,
  slot_key text not null,
  weight numeric not null check (weight > 0),
  primary key (pain_point_id, test_key, slot_key)
);
alter table assessment_slot_links enable row level security;
drop policy if exists authenticated_read_assessment_slot_links on assessment_slot_links;
create policy authenticated_read_assessment_slot_links on assessment_slot_links
  for select to authenticated using (true);

create table if not exists slot_ladder (
  pain_point_id text not null references pain_points(id),
  slot_key text not null,
  level smallint not null check (level >= 1),
  exercise_id uuid not null references exercises(id),
  alt_rank smallint not null,
  step smallint not null check (step >= 1),
  sets smallint not null,
  reps_or_duration text not null,
  primary key (pain_point_id, slot_key, level, exercise_id, step)
);
alter table slot_ladder enable row level security;
drop policy if exists authenticated_read_slot_ladder on slot_ladder;
create policy authenticated_read_slot_ladder on slot_ladder
  for select to authenticated using (true);

-- ---------------------------------------------------------------- per-sprint state
alter table sprints
  add column if not exists ai_summary text,
  add column if not exists retest_recommendation jsonb;
-- retest_recommendation shape:
--   { "choice": "stay"|"switch", "reason": string, "suggested_pain_point_id": string|null, "source": "ai"|"rules" }

create table if not exists sprint_slot_state (
  sprint_id uuid not null references sprints(id) on delete cascade,
  slot_key text not null,
  level smallint not null default 1,
  step smallint not null default 1,
  right_streak smallint not null default 0,
  hard_streak smallint not null default 0,
  last_done_on date,
  primary key (sprint_id, slot_key)
);
alter table sprint_slot_state enable row level security;
drop policy if exists owner_read_write_sprint_slot_state on sprint_slot_state;
create policy owner_read_write_sprint_slot_state on sprint_slot_state
  for all to authenticated
  using (exists (select 1 from sprints s where s.id = sprint_slot_state.sprint_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sprints s where s.id = sprint_slot_state.sprint_id and s.owner_id = auth.uid()));

create table if not exists sprint_ai_adjustments (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  slot_key text not null,
  kind text check (kind in ('start', 'pain')),
  level_override smallint,
  prefer_exercise_ids uuid[] not null default '{}',
  avoid_exercise_ids uuid[] not null default '{}',
  priority_delta smallint not null default 0 check (priority_delta between -1 and 1),
  note text,
  created_at timestamptz default now(),
  consumed_at timestamptz
);
alter table sprint_ai_adjustments enable row level security;
drop policy if exists owner_read_write_sprint_ai_adjustments on sprint_ai_adjustments;
create policy owner_read_write_sprint_ai_adjustments on sprint_ai_adjustments
  for all to authenticated
  using (exists (select 1 from sprints s where s.id = sprint_ai_adjustments.sprint_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sprints s where s.id = sprint_ai_adjustments.sprint_id and s.owner_id = auth.uid()));

create table if not exists engine_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sprint_id uuid references sprints(id) on delete set null,
  trigger text check (trigger in ('start', 'pain', 'retest')),
  model text not null,
  input_tokens int,
  output_tokens int,
  outcome text check (outcome in ('ok', 'fallback', 'error')),
  created_at timestamptz default now()
);
alter table engine_calls enable row level security;
drop policy if exists owner_select_engine_calls on engine_calls;
create policy owner_select_engine_calls on engine_calls
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists owner_insert_engine_calls on engine_calls;
create policy owner_insert_engine_calls on engine_calls
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (sprint_id is null
         or exists (select 1 from sprints s where s.id = engine_calls.sprint_id and s.owner_id = auth.uid()))
  );

-- ---------------------------------------------------------------- days, exercises, feedback
alter table sprint_days
  add column if not exists built_at timestamptz,
  add column if not exists why_today text,
  add column if not exists progressed_at timestamptz;

alter table sprint_day_exercises
  add column if not exists level smallint,
  add column if not exists step smallint,
  add column if not exists lead_side text check (lead_side in ('left', 'right')),
  add column if not exists extra_side_set boolean not null default false;

alter table sprint_day_feedback alter column reaction drop not null;
alter table sprint_day_feedback
  add column if not exists effort text check (effort in ('easy', 'right', 'hard')),
  add column if not exists pain smallint check (pain between 0 and 10),
  add column if not exists pain_area text;

update sprint_day_feedback
   set effort = case reaction when 'good' then 'easy' else 'right' end,
       pain   = case reaction when 'hurt' then 6 else 0 end
 where effort is null and pain is null and reaction in ('good', 'neutral', 'hurt');

-- ---------------------------------------------------------------- logger / settings
alter table workout_exercises
  add column if not exists lead_side text check (lead_side in ('left', 'right'));

alter table user_settings
  add column if not exists daily_time_range text check (daily_time_range in ('5-10', '10-20', '20-30'));

-- ---------------------------------------------------------------- continue_sprint RPC
-- Starts the next cycle on the same pain point. The reassessment becomes the new baseline,
-- slot state carries over (last_done_on kept), and 14 empty days are laid out.
-- security invoker: RLS applies exactly as for client calls, so a caller can only
-- continue their own completed sprint.
create or replace function continue_sprint(p_old_sprint_id uuid, p_started_on date)
returns sprints
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old sprints;
  v_new sprints;
  v_old_reassess uuid;
  v_new_baseline uuid;
begin
  select * into v_old from sprints where id = p_old_sprint_id and status = 'completed';
  if not found then
    raise exception 'That sprint is not a completed sprint you own.' using errcode = 'P0002';
  end if;

  insert into sprints (pain_point_id, cycle_number, started_on, status)
  values (v_old.pain_point_id, v_old.cycle_number + 1, p_started_on, 'active')
  returning * into v_new;

  select id into v_old_reassess
    from sprint_assessments
   where sprint_id = v_old.id and phase = 'reassessment' and completed_at is not null;

  insert into sprint_assessments (sprint_id, phase, completed_at)
  values (v_new.id, 'baseline', now())
  returning id into v_new_baseline;

  if v_old_reassess is not null then
    insert into sprint_assessment_results (sprint_assessment_id, test_key, value_left, value_right, value_single, notes)
    select v_new_baseline, test_key, value_left, value_right, value_single, notes
      from sprint_assessment_results
     where sprint_assessment_id = v_old_reassess;
  end if;

  insert into sprint_slot_state (sprint_id, slot_key, level, step, right_streak, hard_streak, last_done_on)
  select v_new.id, slot_key, level, step, right_streak, hard_streak, last_done_on
    from sprint_slot_state
   where sprint_id = v_old.id;

  insert into sprint_days (sprint_id, day_number, date)
  select v_new.id, n, p_started_on + (n - 1)
    from generate_series(1, 14) as n;

  return v_new;
end;
$$;

revoke all on function continue_sprint(uuid, date) from public, anon;
grant execute on function continue_sprint(uuid, date) to authenticated;

-- ---------------------------------------------------------------- in-flight data migration
-- Future days of active sprints get rebuilt just-in-time by the new engine: drop their
-- pre-built exercises unless the day was already started (any workout references it)
-- or completed. Those days keep built_at null so the engine rebuilds them.
delete from sprint_day_exercises sde
 using sprint_days d, sprints s
 where sde.sprint_day_id = d.id
   and s.id = d.sprint_id
   and s.status = 'active'
   and d.date > current_date
   and d.completed_at is null
   and not exists (select 1 from workouts w where w.sprint_day_id = d.id);

-- Every other existing day that still has exercises counts as built (sprint_days has no
-- created_at of its own; the sprint's is the closest truthful timestamp).
update sprint_days d
   set built_at = s.created_at
  from sprints s
 where s.id = d.sprint_id
   and d.built_at is null
   and exists (select 1 from sprint_day_exercises sde where sde.sprint_day_id = d.id);
