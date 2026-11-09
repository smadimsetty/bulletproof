-- Stage 1 (progress + stats). One row per user, lazily created by the app
-- (defaults apply when absent). Holds the weekly workout goal and, going
-- forward, the weight unit and later-stage preferences.
-- Single owner policy; the PK on owner_id means no FK to a parent row, so
-- no parent-ownership check is needed here.

create table user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  weight_unit text not null default 'lbs' check (weight_unit in ('kg', 'lbs')),
  weekly_goal smallint not null default 3 check (weekly_goal between 1 and 14),
  default_visibility text not null default 'followers'
    check (default_visibility in ('private', 'followers', 'public')),
  healthkit_write_enabled boolean not null default false,
  notify_follows boolean not null default true,
  notify_likes boolean not null default true,
  notify_comments boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy owner_all_user_settings on user_settings
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Carry over the existing weight-unit choice (user_profile.weight_unit).
insert into user_settings (owner_id, weight_unit)
select owner_id, weight_unit from user_profile where owner_id is not null
on conflict do nothing;
