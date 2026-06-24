alter table sessions add column owner_id uuid references auth.users(id);

update sessions
set owner_id = '89ac801b-5515-4388-80a7-03662030c487'
where owner_id is null;

alter table sessions
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

alter table sessions
  add column started_at timestamptz,
  add column ended_at timestamptz,
  add column felt_rating smallint check (felt_rating between 1 and 10);

update sessions
set started_at = date::timestamptz,
    ended_at = date::timestamptz
where ended_at is null;

create unique index sessions_one_active_per_owner
  on sessions (owner_id)
  where (ended_at is null);
