create table activity_taxonomy (
  id text primary key,
  label text not null,
  category text not null check (category in ('strength', 'cardio', 'recovery')),
  warmup_focus_body_parts text[] not null default array[]::text[]
);

alter table activity_taxonomy enable row level security;

create policy authenticated_read_activity_taxonomy on activity_taxonomy
  for select
  to authenticated
  using (true);

insert into activity_taxonomy (id, label, category, warmup_focus_body_parts) values
  ('strength_training', 'Strength Training', 'strength', array[]::text[]),
  ('pickleball', 'Pickleball', 'cardio', array['ankles', 'hips', 'knees']),
  ('tennis', 'Tennis', 'cardio', array['ankles', 'hips', 'knees', 'shoulders']),
  ('running', 'Running', 'cardio', array['ankles', 'knees', 'hips']),
  ('yoga', 'Yoga', 'recovery', array['hips', 'hamstrings', 'shoulders']),
  ('mobility', 'Mobility', 'recovery', array[]::text[]),
  ('walking', 'Walking', 'recovery', array['ankles']);
