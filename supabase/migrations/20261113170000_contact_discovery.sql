-- Find friends from contacts (2026-11-13). A user verifies their phone through Supabase Auth
-- (an SMS code; auth.users.phone + phone_confirmed_at), which lets friends who have their
-- number find them. The app sends its contacts' numbers (normalised to E.164 digits) to
-- find_contacts(); nothing sent is stored. Users can turn discovery off in Settings.

alter table user_settings add column discoverable_by_phone boolean not null default true;

create or replace function find_contacts(p_numbers text[])
returns table (id uuid, handle text, display_name text, avatar_path text, is_public boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.handle, p.display_name, p.avatar_path, p.is_public
    from auth.users u
    join profiles p on p.id = u.id
    left join user_settings s on s.owner_id = u.id
   where auth.uid() is not null
     and cardinality(p_numbers) <= 2000
     -- auth.users.phone holds E.164 digits without the '+'
     and u.phone = any (select regexp_replace(n, '\D', '', 'g') from unnest(p_numbers) as n)
     and u.phone_confirmed_at is not null
     and coalesce(s.discoverable_by_phone, true)
     and u.id <> auth.uid()
     and not exists (
       select 1 from user_blocks b
        where (b.blocker_id = u.id and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = u.id)
     )
   order by p.display_name
   limit 200;
$$;
revoke all on function find_contacts(text[]) from public, anon;
grant execute on function find_contacts(text[]) to authenticated;
