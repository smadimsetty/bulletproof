-- "Change today's focus -> Start a new sprint" used to be two client calls: abandon the
-- current sprint, then insert the new one. If the insert failed, the old sprint was
-- already gone. This does both in one transaction.
--
-- security invoker: RLS on sprints applies exactly as it does to the client calls it
-- replaces, so a caller can only abandon and create their own sprints.
-- p_started_on comes from the client because sprint dates are the user's local date.
create or replace function switch_sprint(p_old_sprint_id uuid, p_pain_point_id text, p_started_on date)
returns sprints
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new sprints;
  v_cycle smallint;
begin
  update sprints
     set status = 'abandoned'
   where id = p_old_sprint_id
     and status in ('pending_baseline', 'active', 'pending_reassessment');
  if not found then
    raise exception 'That sprint is no longer in progress.' using errcode = 'P0002';
  end if;

  select count(*) + 1 into v_cycle
    from sprints
   where pain_point_id = p_pain_point_id;

  insert into sprints (pain_point_id, cycle_number, started_on, status)
  values (p_pain_point_id, v_cycle, p_started_on, 'pending_baseline')
  returning * into v_new;

  return v_new;
end;
$$;

revoke all on function switch_sprint(uuid, text, date) from public, anon;
grant execute on function switch_sprint(uuid, text, date) to authenticated;
