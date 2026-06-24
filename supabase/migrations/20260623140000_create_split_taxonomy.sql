-- New in v2: training-split taxonomy. Drives user_profile.preferred_split
-- (FK added in a later migration) and recommendation_blocks.split_day_label
-- (free text, not FK'd to day_labels -- see
-- docs/superpowers/specs/2026-06-23-schema-v2-design.md Decision 12 for why
-- Postgres can't express an FK into an array element).
create table split_taxonomy (
  id text primary key,
  label text not null,
  day_labels text[] not null
);

alter table split_taxonomy enable row level security;

-- Read-only to authenticated app users (Settings-screen dropdown data);
-- no anon grant (unlike exercises) since this is behind the app's auth
-- gate, not linked from the public web dashboard. No write policy for
-- any role -- service role bypasses RLS for this seed and any future
-- admin reseed; no other role should ever write to taxonomy tables.
create policy authenticated_read_split_taxonomy on split_taxonomy
  for select
  to authenticated
  using (true);

insert into split_taxonomy (id, label, day_labels) values
  ('upper_lower', 'Upper / Lower', array['upper', 'lower']),
  ('push_pull_legs', 'Push / Pull / Legs', array['push', 'pull', 'legs']),
  ('arnold', 'Arnold Split', array['chest_back', 'shoulders_arms', 'legs']),
  ('full_body', 'Full Body', array['full_body']);
