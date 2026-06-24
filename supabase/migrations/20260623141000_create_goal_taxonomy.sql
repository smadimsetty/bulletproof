create table goal_taxonomy (
  id text primary key,
  label text not null,
  description text not null
);

alter table goal_taxonomy enable row level security;

create policy authenticated_read_goal_taxonomy on goal_taxonomy
  for select
  to authenticated
  using (true);

insert into goal_taxonomy (id, label, description) values
  ('aesthetic_physique', 'Aesthetic Physique', 'Visible muscle definition and a leaner, more sculpted look.'),
  ('mobility_flexibility', 'Mobility & Flexibility', 'Pain-free range of motion in the joints and movements that matter most to you.'),
  ('total_body_resilience', 'Total-Body Resilience', 'Move and lift pain-free; durable against the injuries you are most prone to.'),
  ('strength_power', 'Strength & Power', 'Heavier lifts and more explosive, forceful movement.'),
  ('endurance', 'Endurance', 'Sustained aerobic capacity for longer runs, matches, or sessions.'),
  ('longevity_recovery', 'Longevity & Recovery', 'Long-term health span: sleep quality, recovery capacity, and sustainable training load.');
