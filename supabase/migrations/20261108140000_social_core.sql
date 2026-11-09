-- Stage 3 (social, accounts). See
-- docs/superpowers/plans/2026-11-08-stage3-social-accounts.md Task 1.
--
-- Additive. Existing owner_all_* policies are never edited; new read
-- policies are ADDED alongside them. Visibility is decided in SQL by
-- security definer helpers (set search_path = public) so policies on
-- follows / user_blocks / profiles never recurse into themselves.
--
-- Visibility rule (verbatim from the plan): a non-owner can read a workout
-- and its children iff no block exists in either direction AND
-- ((visibility = 'public' AND owner profile is_public) OR
--  (visibility in ('followers','public') AND an accepted follow from the
--   reader to the owner exists)) AND the workout is not hidden_by_moderation.

-- ---- tables ---------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (length(display_name) between 1 and 40),
  avatar_path text,
  bio text check (length(bio) <= 160),
  is_public boolean not null default false,
  is_moderator boolean not null default false,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  followee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on follows (followee_id, status);

create table user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked on user_blocks (blocked_id);

alter table workouts
  add column copied_from_workout_id uuid references workouts(id) on delete set null,
  add column hidden_by_moderation boolean not null default false;

create table hidden_workouts (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);

create table workout_likes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, workout_id)
);
create index workout_likes_workout on workout_likes (workout_id);

create table workout_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  hidden_by_moderation boolean not null default false,
  created_at timestamptz not null default now()
);
create index workout_comments_workout on workout_comments (workout_id, created_at);

create table workout_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  path text not null,
  position smallint not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now(),
  -- The storage select policy trusts workout_media.path, so a row may only
  -- point at an object inside its own owner's folder (otherwise B could
  -- reference A's private object path from B's own workout and read it).
  check (split_part(path, '/', 1) = owner_id::text)
);
create index workout_media_workout on workout_media (workout_id);
create unique index workout_media_path on workout_media (path);

-- ---- helper functions (security definer, no RLS recursion) ----------------

create or replace function is_blocked_between(a uuid, b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function follows_accepted(reader uuid, owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from follows
    where follower_id = reader and followee_id = owner and status = 'accepted'
  );
$$;

create or replace function can_read_workout(w_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workouts w
    where w.id = w_id
      and (
        w.owner_id = auth.uid()
        or (
          not w.hidden_by_moderation
          and not is_blocked_between(auth.uid(), w.owner_id)
          and (
            (w.visibility = 'public'
              and exists (select 1 from profiles p where p.id = w.owner_id and p.is_public))
            or (w.visibility in ('followers', 'public')
              and follows_accepted(auth.uid(), w.owner_id))
          )
        )
      )
  );
$$;

create or replace function can_view_profile_details(p_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select
    p_id = auth.uid()
    or (
      not is_blocked_between(auth.uid(), p_id)
      and (
        exists (select 1 from profiles p where p.id = p_id and p.is_public)
        or follows_accepted(auth.uid(), p_id)
      )
    );
$$;

create or replace function can_read_workout_exercise(we_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workout_exercises we
    where we.id = we_id and can_read_workout(we.workout_id)
  );
$$;

-- True when `e_id` is referenced by an exercise row of a workout the caller
-- may read (so a follower can resolve the owner's custom exercise names).
create or replace function can_read_exercise_via_workout(e_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workout_exercises we
    where we.exercise_id = e_id and can_read_workout(we.workout_id)
  );
$$;

create or replace function can_read_media_path(p text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workout_media wm
    where wm.path = p and can_read_workout(wm.workout_id)
  );
$$;

create or replace function can_read_avatar_path(p text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_owner uuid;
begin
  v_owner := (storage.foldername(p))[1]::uuid;
  return not is_blocked_between(auth.uid(), v_owner);
exception when others then
  return false;
end;
$$;

create or replace function is_moderator()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_moderator);
$$;

-- Counts for a profile; nulls unless the caller may view its details.
create or replace function profile_follow_counts(p_id uuid)
returns table (follower_count int, following_count int)
language sql security definer stable set search_path = public as $$
  select
    case when can_view_profile_details(p_id)
      then (select count(*)::int from follows where followee_id = p_id and status = 'accepted') end,
    case when can_view_profile_details(p_id)
      then (select count(*)::int from follows where follower_id = p_id and status = 'accepted') end;
$$;

-- Followers / following list of a profile the caller may view, minus anyone
-- blocked in either direction with the caller.
create or replace function list_follow_profiles(p_id uuid, p_kind text, p_limit int default 50, p_offset int default 0)
returns setof profiles
language sql security definer stable set search_path = public as $$
  select pr.*
  from follows f
  join profiles pr on pr.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where can_view_profile_details(p_id)
    and f.status = 'accepted'
    and ((p_kind = 'followers' and f.followee_id = p_id) or (p_kind = 'following' and f.follower_id = p_id))
    and not is_blocked_between(auth.uid(), pr.id)
  order by f.created_at desc
  limit least(p_limit, 100) offset p_offset;
$$;

revoke execute on function
  is_blocked_between(uuid, uuid), follows_accepted(uuid, uuid), can_read_workout(uuid),
  can_view_profile_details(uuid), can_read_workout_exercise(uuid),
  can_read_exercise_via_workout(uuid), can_read_media_path(text), can_read_avatar_path(text),
  is_moderator(), profile_follow_counts(uuid), list_follow_profiles(uuid, text, int, int)
  from public, anon;
grant execute on function
  is_blocked_between(uuid, uuid), follows_accepted(uuid, uuid), can_read_workout(uuid),
  can_view_profile_details(uuid), can_read_workout_exercise(uuid),
  can_read_exercise_via_workout(uuid), can_read_media_path(text), can_read_avatar_path(text),
  is_moderator(), profile_follow_counts(uuid), list_follow_profiles(uuid, text, int, int)
  to authenticated, service_role;

-- ---- guard / maintenance triggers ------------------------------------------
-- current_user is 'authenticated' / 'anon' for direct client writes and the
-- function owner / service_role / postgres otherwise (including inside our
-- own security definer functions), so it separates "client" from "system"
-- without relying on the JWT claims.

create or replace function guard_profile_moderator()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.is_moderator then
      raise exception 'is_moderator cannot be set by clients';
    elsif tg_op = 'UPDATE' and new.is_moderator is distinct from old.is_moderator then
      raise exception 'is_moderator cannot be changed by clients';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_moderator before insert or update on profiles
  for each row execute function guard_profile_moderator();

-- hidden_by_moderation is system-only on workouts and comments (the owner
-- policy would otherwise let an author un-hide their own reported post).
create or replace function guard_hidden_by_moderation()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hidden_by_moderation := false;
    elsif new.hidden_by_moderation is distinct from old.hidden_by_moderation then
      new.hidden_by_moderation := old.hidden_by_moderation;
    end if;
  end if;
  return new;
end;
$$;
create trigger workouts_guard_hidden before insert or update on workouts
  for each row execute function guard_hidden_by_moderation();
create trigger workout_comments_guard_hidden before insert or update on workout_comments
  for each row execute function guard_hidden_by_moderation();

-- Follow status is decided by the server: accepted when the followee's
-- profile is public, else pending. Rejected when blocked either way.
create or replace function follows_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_blocked_between(new.follower_id, new.followee_id) then
    raise exception 'You can''t follow this user.';
  end if;
  new.status := case
    when exists (select 1 from profiles p where p.id = new.followee_id and p.is_public)
      then 'accepted' else 'pending' end;
  return new;
end;
$$;
create trigger follows_before_insert before insert on follows
  for each row execute function follows_before_insert();

-- The followee may only flip pending -> accepted; nothing else is editable.
create or replace function follows_before_update()
returns trigger language plpgsql as $$
begin
  if new.follower_id <> old.follower_id or new.followee_id <> old.followee_id then
    raise exception 'follow participants cannot be changed';
  end if;
  new.created_at := old.created_at;
  new.status := 'accepted';
  return new;
end;
$$;
create trigger follows_before_update before update on follows
  for each row execute function follows_before_update();

-- Blocking removes any follow between the two users, both ways.
create or replace function user_blocks_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;
create trigger user_blocks_after_insert after insert on user_blocks
  for each row execute function user_blocks_after_insert();

-- ---- RLS --------------------------------------------------------------------

alter table profiles enable row level security;
alter table follows enable row level security;
alter table user_blocks enable row level security;
alter table hidden_workouts enable row level security;
alter table workout_likes enable row level security;
alter table workout_comments enable row level security;
alter table workout_media enable row level security;

-- profiles: any signed-in user can read a profile row unless blocked either
-- way. NOTE: RLS is row-level, so `bio` is readable on private profiles too;
-- the client shows only handle/name/avatar/Private for non-viewable ones.
create policy social_read_profiles on profiles
  for select to authenticated
  using (id = auth.uid() or not is_blocked_between(auth.uid(), id));
create policy profiles_insert_own on profiles
  for insert to authenticated
  with check (id = auth.uid() and terms_accepted_at is not null);
create policy profiles_update_own on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- follows
create policy follows_select_involved on follows
  for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
create policy follows_insert_as_follower on follows
  for insert to authenticated
  with check (follower_id = auth.uid());
create policy follows_accept_as_followee on follows
  for update to authenticated
  using (followee_id = auth.uid())
  with check (followee_id = auth.uid());
create policy follows_delete_either_side on follows
  for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- user_blocks: own rows only
create policy user_blocks_select_own on user_blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy user_blocks_insert_own on user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy user_blocks_delete_own on user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- hidden_workouts: own rows; may only hide a workout the user can read.
create policy owner_all_hidden_workouts on hidden_workouts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_read_workout(workout_id));

-- workouts and children: shared read, alongside owner_all_*
create policy social_read_workouts on workouts
  for select to authenticated
  using (can_read_workout(id));
create policy social_read_workout_exercises on workout_exercises
  for select to authenticated
  using (can_read_workout(workout_id));
create policy social_read_workout_sets on workout_sets
  for select to authenticated
  using (can_read_workout_exercise(workout_exercise_id));

-- exercises: widen reads so a reader can resolve a custom exercise used in a
-- workout they may read. `to authenticated` + owner_id is not null keeps
-- anon (and unrelated users) away from custom rows.
create policy social_read_referenced_exercises on exercises
  for select to authenticated
  using (owner_id is not null and can_read_exercise_via_workout(id));

-- likes
create policy social_read_workout_likes on workout_likes
  for select to authenticated
  using (can_read_workout(workout_id) and not is_blocked_between(auth.uid(), user_id));
create policy workout_likes_insert_own on workout_likes
  for insert to authenticated
  with check (user_id = auth.uid() and can_read_workout(workout_id));
create policy workout_likes_delete_own on workout_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- comments
create policy social_read_workout_comments on workout_comments
  for select to authenticated
  using (
    can_read_workout(workout_id)
    and not is_blocked_between(auth.uid(), owner_id)
    and (not hidden_by_moderation or owner_id = auth.uid())
  );
create policy workout_comments_insert_own on workout_comments
  for insert to authenticated
  with check (owner_id = auth.uid() and can_read_workout(workout_id));
create policy workout_comments_delete_own_or_workout_owner on workout_comments
  for delete to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from workouts w where w.id = workout_comments.workout_id and w.owner_id = auth.uid())
  );

-- media
create policy social_read_workout_media on workout_media
  for select to authenticated
  using (can_read_workout(workout_id));
create policy workout_media_insert_own on workout_media
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from workouts w where w.id = workout_media.workout_id and w.owner_id = auth.uid())
  );
create policy workout_media_update_own on workout_media
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from workouts w where w.id = workout_media.workout_id and w.owner_id = auth.uid())
  );
create policy workout_media_delete_own on workout_media
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---- storage ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('workout-media', 'workout-media', false, 5242880, array['image/jpeg', 'image/png']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy social_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('workout-media', 'avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy social_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('workout-media', 'avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy social_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('workout-media', 'avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy social_objects_select_workout_media on storage.objects
  for select to authenticated
  using (bucket_id = 'workout-media' and can_read_media_path(name));
create policy social_objects_select_avatars on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and can_read_avatar_path(name));
