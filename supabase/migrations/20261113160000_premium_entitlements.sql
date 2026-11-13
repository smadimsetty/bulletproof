-- Premium (paid plan, 2026-11-13): $2/month or $10/year through Apple in-app purchase,
-- with a 2-week free trial as Apple's introductory offer. Beta testers get premium for life.
--
-- subscriptions: written only by the verify-subscription Edge Function (service role) after
--   it has checked Apple's signature on the transaction. Owners can read their own rows.
-- premium_grants: lifetime premium given by hand (e.g. a beta tester who joins after launch):
--   insert into premium_grants (owner_id, reason) values ('<uuid>', 'beta tester');
-- app_config.founder_cutoff: every account created BEFORE this instant is a founder with
--   lifetime premium. While it is null (the beta), every account is a founder.
--   AT PUBLIC LAUNCH: update app_config set value = to_jsonb(now()) where key = 'founder_cutoff';

create table subscriptions (
  original_transaction_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  expires_at timestamptz not null,
  environment text not null,
  is_trial boolean not null default false,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
create index subscriptions_owner on subscriptions (owner_id, expires_at desc);
alter table subscriptions enable row level security;
create policy owner_read_subscriptions on subscriptions for select to authenticated using (owner_id = auth.uid());

create table premium_grants (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table premium_grants enable row level security;
create policy owner_read_premium_grants on premium_grants for select to authenticated using (owner_id = auth.uid());

create table app_config (
  key text primary key,
  value jsonb
);
alter table app_config enable row level security; -- no policies: only security definer functions and the service role read it
insert into app_config (key, value) values ('founder_cutoff', null);

-- The caller's (or, for the service role, any user's) premium status:
-- {"status": "founder" | "trial" | "subscribed" | "none", "expires_at", "product_id"}.
create or replace function premium_status(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with u as (select created_at from auth.users where id = p_user),
  cutoff as (select (value #>> '{}')::timestamptz as at from app_config where key = 'founder_cutoff'),
  sub as (
    select product_id, expires_at, is_trial from subscriptions
     where owner_id = p_user and revoked_at is null and expires_at > now()
     order by expires_at desc limit 1
  )
  select case
    when exists (select 1 from premium_grants where owner_id = p_user)
      or exists (select 1 from u where (select at from cutoff) is null or u.created_at < (select at from cutoff))
      then jsonb_build_object('status', 'founder', 'expires_at', null, 'product_id', null)
    when exists (select 1 from sub)
      then (select jsonb_build_object('status', case when is_trial then 'trial' else 'subscribed' end,
                                      'expires_at', expires_at, 'product_id', product_id) from sub)
    else jsonb_build_object('status', 'none', 'expires_at', null, 'product_id', null)
  end;
$$;
revoke all on function premium_status(uuid) from public, anon, authenticated;
grant execute on function premium_status(uuid) to service_role;

-- App-facing wrapper: always the caller's own status.
create or replace function my_premium_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select premium_status(auth.uid()) $$;
revoke all on function my_premium_status() from public, anon;
grant execute on function my_premium_status() to authenticated;
