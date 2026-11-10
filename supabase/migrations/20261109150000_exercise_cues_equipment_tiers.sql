-- Logger polish + sprints, task 1: plain-words cue per exercise, the user's
-- equipment tier, a tagline per pain point, and one canonical set of
-- body-part keys on exercises (global and custom rows).

alter table exercises add column if not exists cue text;

alter table user_settings add column if not exists equipment_tier text
  check (equipment_tier in ('basic', 'intermediate', 'advanced'));

alter table pain_points add column if not exists tagline text;

update exercises
set body_parts = array(
  select distinct case b
    when 'ankle' then 'ankles'
    when 'hip' then 'hips'
    when 'hamstring' then 'hamstrings'
    when 'shoulder' then 'shoulders'
    when 'lumbar_spine' then 'lower_back'
    else b
  end
  from unnest(body_parts) as b
)
where body_parts is not null;
