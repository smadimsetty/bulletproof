-- Stage 3: reports + auto-hide, word filter, inbox (notifications), push
-- plumbing. See docs/superpowers/plans/2026-11-08-stage3-social-accounts.md
-- Task 2.
--
-- Controller prerequisites: pg_net extension (created below if permitted),
-- Vault secrets `project_url` (e.g. https://<ref>.supabase.co) and
-- `push_webhook_secret`; the send-push Edge Function must have the same
-- value as its PUSH_WEBHOOK_SECRET function secret and run with
-- verify_jwt = false (it authenticates via the x-push-secret header).

create extension if not exists pg_net;

-- ---- notifications (created first: reports reference it) --------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in
    ('follow_request', 'follow_accepted', 'new_follower', 'like', 'comment', 'report')),
  workout_id uuid references workouts(id) on delete cascade,
  comment_id uuid references workout_comments(id) on delete cascade,
  report_id uuid, -- FK added below once content_reports exists (report kind only)
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient on notifications (recipient_id, created_at desc);

alter table notifications enable row level security;

create policy notifications_select_own on notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    and (actor_id is null or not is_blocked_between(auth.uid(), actor_id))
  );
create policy notifications_update_own on notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
create policy notifications_delete_own on notifications
  for delete to authenticated
  using (recipient_id = auth.uid());
-- No insert policy: only triggers (security definer) create inbox rows.
-- Clients may only mark read: restrict updates to the read_at column.
revoke update on notifications from authenticated, anon;
grant update (read_at) on notifications to authenticated;
revoke insert on notifications from authenticated, anon;

-- ---- reports --------------------------------------------------------------------

create table content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  target_type text not null check (target_type in ('workout', 'comment', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'nudity', 'hate', 'violence', 'other')),
  note text check (length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index content_reports_target on content_reports (target_type, target_id);

alter table notifications
  add constraint notifications_report_id_fkey
  foreign key (report_id) references content_reports(id) on delete cascade;

alter table content_reports enable row level security;

create policy content_reports_insert_own on content_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (target_type <> 'workout' or can_read_workout(target_id))
  );
create policy content_reports_select_own on content_reports
  for select to authenticated
  using (reporter_id = auth.uid());
-- Moderators (profiles.is_moderator, set only via SQL) triage reports.
create policy content_reports_moderator_select on content_reports
  for select to authenticated
  using (is_moderator());
create policy content_reports_moderator_update on content_reports
  for update to authenticated
  using (is_moderator())
  with check (is_moderator());
revoke update on content_reports from authenticated, anon;
grant update (status) on content_reports to authenticated;

create or replace function content_reports_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_distinct int;
  v_workout_id uuid;
  v_comment_id uuid;
begin
  -- unique (reporter, type, target) makes the row count the distinct reporters.
  select count(*) into v_distinct
  from content_reports
  where target_type = new.target_type and target_id = new.target_id;

  if new.target_type = 'workout' then
    v_workout_id := new.target_id;
    if v_distinct >= 3 then
      update workouts set hidden_by_moderation = true where id = new.target_id;
    end if;
  elsif new.target_type = 'comment' then
    v_comment_id := new.target_id;
    select workout_id into v_workout_id from workout_comments where id = new.target_id;
    if v_distinct >= 3 then
      update workout_comments set hidden_by_moderation = true where id = new.target_id;
    end if;
  end if;

  insert into notifications (recipient_id, actor_id, kind, workout_id, comment_id, report_id)
  select p.id, new.reporter_id, 'report', v_workout_id, v_comment_id, new.id
  from profiles p
  where p.is_moderator and p.id <> new.reporter_id;

  return new;
end;
$$;
create trigger content_reports_after_insert after insert on content_reports
  for each row execute function content_reports_after_insert();

-- ---- word filter -------------------------------------------------------------------

create table blocked_terms (term text primary key check (term = lower(term)));
-- RLS on with no policies: readable/writable by the service role only.
alter table blocked_terms enable row level security;

insert into blocked_terms (term) values
  -- slurs
  ('nigger'), ('nigga'), ('faggot'), ('kike'), ('spic'), ('gook'), ('wetback'),
  ('tranny'), ('retard'), ('cunt'), ('paki'), ('towelhead'), ('beaner'),
  -- violent threats / self-harm encouragement
  ('kill yourself'), ('kys'), ('kill you'), ('hope you die'), ('shoot you'),
  ('rape you'), ('stab you'),
  -- explicit sexual
  ('blowjob'), ('handjob'), ('cumshot'), ('gangbang'), ('creampie'),
  ('deepthroat'), ('nudes'), ('porn'), ('child porn')
on conflict do nothing;

create or replace function check_blocked_terms(t text)
returns void language plpgsql security definer stable set search_path = public as $$
begin
  if t is null or t = '' then
    return;
  end if;
  if exists (
    select 1 from blocked_terms b
    where t ~* ('\m' || regexp_replace(b.term, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')
  ) then
    raise exception 'That text isn''t allowed.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function check_blocked_terms(text) from public, anon;
grant execute on function check_blocked_terms(text) to authenticated, service_role;

create or replace function profiles_check_terms()
returns trigger language plpgsql as $$
begin
  perform check_blocked_terms(new.handle);
  perform check_blocked_terms(new.display_name);
  perform check_blocked_terms(new.bio);
  return new;
end;
$$;
create trigger profiles_check_terms before insert or update on profiles
  for each row execute function profiles_check_terms();

create or replace function workout_comments_check_terms()
returns trigger language plpgsql as $$
begin
  perform check_blocked_terms(new.body);
  return new;
end;
$$;
create trigger workout_comments_check_terms before insert or update of body on workout_comments
  for each row execute function workout_comments_check_terms();

create or replace function workouts_check_terms()
returns trigger language plpgsql as $$
begin
  if new.visibility <> 'private' then
    perform check_blocked_terms(new.title);
    perform check_blocked_terms(new.notes);
  end if;
  return new;
end;
$$;
create trigger workouts_check_terms before insert or update on workouts
  for each row execute function workouts_check_terms();

-- ---- inbox triggers -----------------------------------------------------------------

create or replace function notify_on_follow_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, actor_id, kind)
  values (
    new.followee_id, new.follower_id,
    case when new.status = 'pending' then 'follow_request' else 'new_follower' end
  );
  return new;
end;
$$;
create trigger notify_on_follow_insert after insert on follows
  for each row execute function notify_on_follow_insert();

create or replace function notify_on_follow_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into notifications (recipient_id, actor_id, kind)
    values (new.follower_id, new.followee_id, 'follow_accepted');
  end if;
  return new;
end;
$$;
create trigger notify_on_follow_accept after update of status on follows
  for each row execute function notify_on_follow_accept();

create or replace function notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from workouts where id = new.workout_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into notifications (recipient_id, actor_id, kind, workout_id)
    values (v_owner, new.user_id, 'like', new.workout_id);
  end if;
  return new;
end;
$$;
create trigger notify_on_like after insert on workout_likes
  for each row execute function notify_on_like();

create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from workouts where id = new.workout_id;
  if v_owner is not null and v_owner <> new.owner_id then
    insert into notifications (recipient_id, actor_id, kind, workout_id, comment_id)
    values (v_owner, new.owner_id, 'comment', new.workout_id, new.id);
  end if;
  return new;
end;
$$;
create trigger notify_on_comment after insert on workout_comments
  for each row execute function notify_on_comment();

-- ---- push tokens + settings ---------------------------------------------------------

create table push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token text not null,
  platform text check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index push_tokens_token on push_tokens (token);

alter table push_tokens enable row level security;
create policy owner_all_push_tokens on push_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A device token belongs to whoever registered it last (shared device /
-- account switch): drop it from any other user.
create or replace function push_tokens_claim_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from push_tokens where token = new.token and user_id <> new.user_id;
  return new;
end;
$$;
create trigger push_tokens_claim_token before insert or update on push_tokens
  for each row execute function push_tokens_claim_token();

alter table user_settings add column notify_reports boolean not null default true;

-- ---- push webhook -----------------------------------------------------------------------

create or replace function notifications_send_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  -- A push failure must never fail the user's write.
  return new;
end;
$$;
create trigger notifications_send_push after insert on notifications
  for each row execute function notifications_send_push();
