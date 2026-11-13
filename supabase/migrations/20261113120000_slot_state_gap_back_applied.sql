-- Missed-day step-backs already applied to a slot since its sprint's last real session.
-- Keeps the engine's gap rule idempotent across repeated day builds (see
-- apps/mobile/lib/engine/progression.ts applyGap). continue_sprint now carries it over
-- with the rest of the slot state, so a carried gap is never applied twice.
alter table sprint_slot_state
  add column if not exists gap_back_applied smallint not null default 0;

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

  insert into sprint_slot_state (sprint_id, slot_key, level, step, right_streak, hard_streak, last_done_on, gap_back_applied)
  select v_new.id, slot_key, level, step, right_streak, hard_streak, last_done_on, gap_back_applied
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
