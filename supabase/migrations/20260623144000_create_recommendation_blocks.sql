create table recommendation_blocks (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  block_order smallint not null,
  block_type session_type not null,
  split_day_label text,
  title text not null,
  estimated_minutes smallint,
  created_at timestamptz not null default now()
);

alter table recommendation_blocks enable row level security;

create table recommendation_block_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references recommendation_blocks(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  exercise_order smallint not null,
  prescribed_sets smallint,
  prescribed_reps text,
  prescribed_weight_note text,
  is_unilateral_left_first boolean not null default false,
  notes text,
  swapped_from_exercise_id uuid references exercises(id),
  created_at timestamptz not null default now()
);

alter table recommendation_block_exercises enable row level security;
