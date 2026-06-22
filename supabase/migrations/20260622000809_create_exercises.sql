create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  movement_pattern text not null check (
    movement_pattern in ('squat', 'hinge', 'push', 'pull', 'core', 'mobility', 'balance')
  ),
  demo_video_url text,
  is_complex boolean not null default false,
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;

-- Exercises are not sensitive: the public recommendation view links to them
-- directly, so anonymous readers need select access.
create policy "anon_can_read_exercises"
  on exercises
  for select
  to anon
  using (true);
