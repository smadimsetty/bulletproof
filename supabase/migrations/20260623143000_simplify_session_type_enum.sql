create type session_type_v2 as enum (
  'upper',
  'lower',
  'pickleball',
  'run',
  'rest',
  'mobility'
);

drop view recommendations_public;

alter table sessions
  alter column type type session_type_v2
  using (
    case type::text
      when 'upper_a' then 'upper'::session_type_v2
      when 'upper_b' then 'upper'::session_type_v2
      when 'lower_a' then 'lower'::session_type_v2
      when 'lower_b' then 'lower'::session_type_v2
      else type::text::session_type_v2
    end
  );

alter table recommendations
  alter column top_pick type session_type_v2
  using (
    case top_pick::text
      when 'upper_a' then 'upper'::session_type_v2
      when 'upper_b' then 'upper'::session_type_v2
      when 'lower_a' then 'lower'::session_type_v2
      when 'lower_b' then 'lower'::session_type_v2
      else top_pick::text::session_type_v2
    end
  );

alter table recommendations
  alter column runner_up type session_type_v2
  using (
    case runner_up::text
      when 'upper_a' then 'upper'::session_type_v2
      when 'upper_b' then 'upper'::session_type_v2
      when 'lower_a' then 'lower'::session_type_v2
      when 'lower_b' then 'lower'::session_type_v2
      else runner_up::text::session_type_v2
    end
  );

drop type session_type;

alter type session_type_v2 rename to session_type;

create view recommendations_public
  with (security_invoker = false)
  as
  select date, top_pick, runner_up, public_rationale, generated_at
  from recommendations;

grant select on recommendations_public to anon, authenticated;
