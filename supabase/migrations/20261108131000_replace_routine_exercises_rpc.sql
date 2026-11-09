-- Atomically replaces a routine's exercises (delete + insert in one
-- transaction). SECURITY INVOKER: RLS on routine_exercises still applies, so
-- a caller can only touch their own routine's rows.
create or replace function public.replace_routine_exercises(p_routine_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.routine_exercises where routine_id = p_routine_id;

  insert into public.routine_exercises
    (routine_id, exercise_id, position, target_sets, target_reps, target_duration_s, target_weight_kg, rest_s, notes)
  select
    p_routine_id,
    (r->>'exercise_id')::uuid,
    (r->>'position')::smallint,
    coalesce((r->>'target_sets')::smallint, 3),
    (r->>'target_reps')::smallint,
    (r->>'target_duration_s')::integer,
    (r->>'target_weight_kg')::numeric,
    (r->>'rest_s')::smallint,
    r->>'notes'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

revoke execute on function public.replace_routine_exercises(uuid, jsonb) from public, anon;
grant execute on function public.replace_routine_exercises(uuid, jsonb) to authenticated;
