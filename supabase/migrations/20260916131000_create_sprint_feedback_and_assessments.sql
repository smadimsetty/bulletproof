create table sprint_day_feedback (
  id uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references sprint_days(id) on delete cascade,
  reaction text not null check (reaction in ('good', 'neutral', 'hurt')),
  note text,
  created_at timestamptz not null default now(),
  unique (sprint_day_id)
);

alter table sprint_day_feedback enable row level security;

create policy owner_read_write_sprint_day_feedback on sprint_day_feedback
  for all
  to authenticated
  using (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_feedback.sprint_day_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_feedback.sprint_day_id and s.owner_id = auth.uid()
    )
  );

create table sprint_assessments (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  phase text not null check (phase in ('baseline', 'reassessment')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sprint_id, phase)
);

alter table sprint_assessments enable row level security;

create policy owner_read_write_sprint_assessments on sprint_assessments
  for all
  to authenticated
  using (exists (select 1 from sprints s where s.id = sprint_assessments.sprint_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sprints s where s.id = sprint_assessments.sprint_id and s.owner_id = auth.uid()));

create table sprint_assessment_results (
  id uuid primary key default gen_random_uuid(),
  sprint_assessment_id uuid not null references sprint_assessments(id) on delete cascade,
  test_key text not null,
  value_left numeric,
  value_right numeric,
  value_single numeric,
  notes text,
  unique (sprint_assessment_id, test_key)
);

alter table sprint_assessment_results enable row level security;

create policy owner_read_write_sprint_assessment_results on sprint_assessment_results
  for all
  to authenticated
  using (
    exists (
      select 1 from sprint_assessments a
      join sprints s on s.id = a.sprint_id
      where a.id = sprint_assessment_results.sprint_assessment_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sprint_assessments a
      join sprints s on s.id = a.sprint_id
      where a.id = sprint_assessment_results.sprint_assessment_id and s.owner_id = auth.uid()
    )
  );
