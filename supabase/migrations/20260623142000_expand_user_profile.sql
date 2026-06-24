alter table user_profile add column owner_id uuid references auth.users(id);

update user_profile
set owner_id = '89ac801b-5515-4388-80a7-03662030c487'
where owner_id is null;

alter table user_profile
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

alter table user_profile rename column injury_constraints to pains;

update user_profile
set pains = '[
  {"body_part": "neck", "severity": 5, "note": "chronic stiffness, root cause treated as thoracic spine", "since": null},
  {"body_part": "ankles", "severity": 5, "note": "both injured over ~1.5yrs, highest reinjury risk under high volume / lateral pickleball movement", "since": null},
  {"body_part": "hips", "severity": 5, "note": "wants better mobility: deep squat, down dog, flexibility poses (also covers hamstrings)", "since": null},
  {"body_part": "shoulders", "severity": 5, "note": "right arm stronger and tighter/less mobile than left (right-side dominance)", "since": null}
]'::jsonb
where pains = '{
  "neck": {"note": "chronic stiffness, root cause treated as thoracic spine", "active": true},
  "ankles": {"note": "both injured over ~1.5yrs, highest reinjury risk under high volume / lateral pickleball movement", "active": true},
  "hips_hamstrings": {"note": "wants better mobility: deep squat, down dog, flexibility poses", "active": true},
  "right_dominance": {"note": "right arm stronger and tighter/less mobile than left", "active": true}
}'::jsonb;

alter table user_profile alter column pains set default '[]'::jsonb;

alter table user_profile
  add column activities jsonb not null default '[]'::jsonb,
  add column preferred_split text references split_taxonomy(id) default 'upper_lower',
  add column current_goals jsonb not null default '[]'::jsonb,
  add column training_frequency_mode text not null default 'auto'
    check (training_frequency_mode in ('manual', 'auto')),
  add column training_frequency_manual jsonb,
  add column diet_preference text,
  add column weight_kg numeric(5, 2),
  add column birth_date date,
  add column location jsonb,
  add column healthkit_sync_enabled boolean not null default false;
