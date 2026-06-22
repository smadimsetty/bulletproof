-- Make the view's security model explicit rather than relying on Postgres's
-- implicit default: this view must run with definer (owner) privileges to
-- read the RLS-protected recommendations table while exposing only 4 safe
-- columns. security_invoker = false makes that load-bearing property visible
-- in the DDL instead of inherited from a version default.
drop view if exists recommendations_public;

create view recommendations_public
  with (security_invoker = false)
  as
  select date, top_pick, runner_up, public_rationale, generated_at
  from recommendations;

grant select on recommendations_public to anon, authenticated;

-- Shared trigger function: keeps updated_at current on every row update.
-- Without this, updated_at silently freezes at insert time forever.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_user_profile
  before update on user_profile
  for each row
  execute function set_updated_at();

create trigger set_updated_at_recovery
  before update on recovery
  for each row
  execute function set_updated_at();
