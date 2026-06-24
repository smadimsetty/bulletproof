create table body_part_taxonomy (
  id text primary key,
  label text not null
);

alter table body_part_taxonomy enable row level security;

create policy authenticated_read_body_part_taxonomy on body_part_taxonomy
  for select
  to authenticated
  using (true);

insert into body_part_taxonomy (id, label) values
  ('neck', 'Neck'),
  ('thoracic_spine', 'Thoracic Spine'),
  ('shoulders', 'Shoulders'),
  ('elbows', 'Elbows'),
  ('wrists', 'Wrists'),
  ('lower_back', 'Lower Back'),
  ('hips', 'Hips'),
  ('hamstrings', 'Hamstrings'),
  ('knees', 'Knees'),
  ('ankles', 'Ankles'),
  ('feet', 'Feet'),
  ('other', 'Other (describe)');
