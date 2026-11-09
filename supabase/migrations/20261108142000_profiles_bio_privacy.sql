-- Private profiles must not leak their bio (spec §5a: non-followers see
-- handle, display name, avatar and a Private badge only). RLS is row-level,
-- and a column-level REVOKE does nothing while a table-level SELECT grant
-- exists, so: drop table-level SELECT for client roles, re-grant every column
-- except bio, and serve bio through a function that applies
-- can_view_profile_details. Clients must therefore select explicit columns
-- from profiles (select('*') would be denied).

revoke select on profiles from anon, authenticated;
grant select (id, handle, display_name, avatar_path, is_public, is_moderator, terms_accepted_at, created_at)
  on profiles to authenticated;

create or replace function profile_bio(p_id uuid)
returns text
language sql security definer stable set search_path = public as $$
  select case when can_view_profile_details(p_id) then p.bio end
  from profiles p
  where p.id = p_id;
$$;

revoke execute on function profile_bio(uuid) from public, anon;
grant execute on function profile_bio(uuid) to authenticated, service_role;

-- list_follow_profiles returned whole profile rows (incl. bio) as security
-- definer; redefine it to return only the public card columns.
drop function if exists list_follow_profiles(uuid, text, int, int);
create function list_follow_profiles(p_id uuid, p_kind text, p_limit int default 50, p_offset int default 0)
returns table (id uuid, handle text, display_name text, avatar_path text, is_public boolean)
language sql security definer stable set search_path = public as $$
  select pr.id, pr.handle, pr.display_name, pr.avatar_path, pr.is_public
  from follows f
  join profiles pr on pr.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where can_view_profile_details(p_id)
    and f.status = 'accepted'
    and ((p_kind = 'followers' and f.followee_id = p_id) or (p_kind = 'following' and f.follower_id = p_id))
    and not is_blocked_between(auth.uid(), pr.id)
  order by f.created_at desc
  limit least(p_limit, 100) offset p_offset;
$$;
revoke execute on function list_follow_profiles(uuid, text, int, int) from public, anon;
grant execute on function list_follow_profiles(uuid, text, int, int) to authenticated, service_role;
