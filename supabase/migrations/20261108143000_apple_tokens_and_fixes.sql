-- Stage 3 review fixes.

-- ---- Sign in with Apple token revocation (App Store 5.1.1(v)) -------------
-- Apple refresh tokens, written by the apple-token-exchange Edge Function and
-- revoked by delete-account. Service role only: RLS on, no policies.
create table apple_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table apple_tokens enable row level security;
revoke all on apple_tokens from anon, authenticated;

-- ---- Notification de-duplication -------------------------------------------
-- like / unlike / like again (or follow / unfollow / follow again) must not
-- spam the inbox and push: skip when the same notification exists from the
-- last 24 hours.
create or replace function notify_on_follow_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text := case when new.status = 'pending' then 'follow_request' else 'new_follower' end;
begin
  if not exists (
    select 1 from notifications n
    where n.recipient_id = new.followee_id and n.actor_id = new.follower_id
      and n.kind = v_kind and n.created_at > now() - interval '24 hours'
  ) then
    insert into notifications (recipient_id, actor_id, kind)
    values (new.followee_id, new.follower_id, v_kind);
  end if;
  return new;
end;
$$;

create or replace function notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from workouts where id = new.workout_id;
  if v_owner is not null and v_owner <> new.user_id and not exists (
    select 1 from notifications n
    where n.recipient_id = v_owner and n.actor_id = new.user_id and n.kind = 'like'
      and n.workout_id = new.workout_id and n.created_at > now() - interval '24 hours'
  ) then
    insert into notifications (recipient_id, actor_id, kind, workout_id)
    values (v_owner, new.user_id, 'like', new.workout_id);
  end if;
  return new;
end;
$$;

-- ---- Moderator read access ---------------------------------------------------
-- can_read_workout() hides moderation-hidden and private workouts from
-- everyone but the owner, so a report push opened by the moderator showed
-- "unavailable". Moderators (profiles.is_moderator, settable only by SQL)
-- get read-only access to workouts and their children for review.
create policy moderator_read_workouts on workouts
  for select to authenticated using (is_moderator());
create policy moderator_read_workout_exercises on workout_exercises
  for select to authenticated using (is_moderator());
create policy moderator_read_workout_sets on workout_sets
  for select to authenticated using (is_moderator());
create policy moderator_read_workout_media on workout_media
  for select to authenticated using (is_moderator());
create policy moderator_read_workout_comments on workout_comments
  for select to authenticated using (is_moderator());
create policy moderator_read_workout_media_objects on storage.objects
  for select to authenticated using (bucket_id = 'workout-media' and is_moderator());
