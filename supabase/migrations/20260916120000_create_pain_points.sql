create table pain_points (
  id text primary key,
  display_name text not null,
  description text not null,
  sort_order smallint not null
);

alter table pain_points enable row level security;

create policy authenticated_read_pain_points on pain_points
  for select
  to authenticated
  using (true);

insert into pain_points (id, display_name, description, sort_order) values
  ('ankle', 'Ankles', 'Ankle stability, dorsiflexion range, and calf/peroneal capacity -- built for the post-sprain rebuild described in the Mobility Bible, Ch. 4.', 1),
  ('rounded_shoulders', 'Rounded Shoulders', 'Scapular and thoracic capacity work, framed around overhead/behind-the-body load tolerance rather than posture correction -- Mobility Bible Ch. 8.', 2),
  ('nerd_neck', 'Nerd Neck', 'Deep cervical flexor and upper-back capacity work -- Mobility Bible Ch. 9, with a self-assessment battery synthesized from standard PT screening since the book has none.', 3),
  ('anterior_pelvic_tilt', 'Anterior Pelvic Tilt', 'Hip flexor length, anterior core, and glute capacity work -- drawn from Mobility Bible Ch. 5 (hip) and Ch. 7 (lumbar), with most of its assessment battery synthesized since the book has no dedicated APT chapter.', 4);
