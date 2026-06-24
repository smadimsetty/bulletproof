alter table exercises
  add column exercise_type text
    check (exercise_type in ('strength', 'mobility_stretch', 'plyometric', 'balance', 'cardio')),
  add column target_goals text[] not null default array[]::text[],
  add column body_parts text[] not null default array[]::text[],
  add column evidence_rationale text,
  add column equipment_needed text[] not null default array[]::text[],
  add column default_sets smallint,
  add column default_rep_range text,
  add column unilateral boolean not null default false,
  add column is_corrective boolean not null default false;
