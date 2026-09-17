# Mobility Sprint Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the Bulletproof app's Home tab from the Oura-driven daily lift/pickleball/run recommender into a pain-point-driven mobility coach: pick one of 4 pain points (Ankles, Rounded Shoulders, Nerd Neck, Anterior Pelvic Tilt), take a baseline assessment, run a 14-calendar-day sprint of ~10-minute daily routines, reassess, repeat.

**Architecture:** Reuse the existing Supabase (multi-user RLS) + Expo Router mobile app. Add a small global content schema (`pain_points`, `sprint_exercise_pool`, `sprint_day_template`, `assessment_definitions`) authored once, plus owner-scoped personal tables (`sprints`, `sprint_days`, `sprint_day_exercises`, `sprint_day_feedback`, `sprint_assessments`, `sprint_assessment_results`) for each user's runs through that content. A ~20-line least-recently-used picker resolves each day's exercises from the content pool. Remove the Logger feature entirely; leave the old recommendation engine/cron dormant; leave Trends/Settings untouched.

**Tech Stack:** Supabase Postgres + RLS (SQL migrations), Expo Router / React Native / TypeScript, Jest for pure-function tests.

## Global Constraints

- Every new personal table gets `owner_id uuid references auth.users(id) not null default auth.uid()` with `owner_id = auth.uid()` policies (`docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md` §2, mirroring `CLAUDE.md`'s existing multi-user RLS pattern).
- Every new global/shared table gets an **`authenticated_read_<table>`** policy (`to authenticated using (true)`) at creation time — never add only an `anon` policy. `CLAUDE.md`'s "Supabase migrations are never auto-applied" section documents the exact production bug (`exercises` missing this policy) this must not repeat.
- After writing any new migration: `export SUPABASE_ACCESS_TOKEN=<token from .env>`, then `npx supabase migration list --linked` **before** `npx supabase db push --linked` — never assume the remote is caught up.
- Mobile code follows existing conventions exactly: pure logic lives in `apps/mobile/lib/*.ts` with a co-located `*.test.ts`; Supabase errors are surfaced as `throw new Error(error.message)`; snake_case DB rows are mapped to camelCase TS types via a `toXRow`-style mapper function; styling uses the existing `apps/mobile/lib/theme.ts` constants (`COLORS`, `SPACING`, `RADII`, `TYPE`, `sharedStyles`) — no new styling library.
- Sprint pacing is calendar-based: `sprint_days.date = started_on + day_number - 1`, fixed regardless of completion (design spec §5).
- MVP content is Tier 1 + Tier 2 only — no Tier 3.
- Run `npm test` inside `apps/mobile/` after every mobile task; run `npm test` (or the project's existing engine test command — this plan does not touch `engine/`) is not required since no Python changes are made.

---

## Task 1: Global content schema — pain points, exercise grading, sprint content model

**Files:**
- Create: `supabase/migrations/20260916120000_create_pain_points.sql`
- Create: `supabase/migrations/20260916120500_add_evidence_grade_to_exercises.sql`
- Create: `supabase/migrations/20260916121000_create_sprint_content_schema.sql`

**Interfaces:**
- Produces: `pain_points` table (`id text primary key` — one of `'ankle'`, `'rounded_shoulders'`, `'nerd_neck'`, `'anterior_pelvic_tilt'`), `exercises.evidence_grade` column, `sprint_exercise_pool` table, `sprint_day_template` table, `assessment_definitions` table. Tasks 3–6 (content seeding) and Task 8 (mobile data layer) consume all of these by name exactly as defined here.

- [ ] **Step 1: Write `20260916120000_create_pain_points.sql`**

```sql
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
```

- [ ] **Step 2: Write `20260916120500_add_evidence_grade_to_exercises.sql`**

```sql
alter table exercises
  add column evidence_grade text check (evidence_grade in ('A', 'B', 'C', 'D'));
```

- [ ] **Step 3: Write `20260916121000_create_sprint_content_schema.sql`**

```sql
create table sprint_exercise_pool (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  tier smallint not null check (tier in (1, 2)),
  slot_key text not null,
  exercise_id uuid not null references exercises(id),
  default_rank smallint not null,
  prescribed_sets smallint,
  prescribed_reps_or_duration text,
  created_at timestamptz not null default now()
);

alter table sprint_exercise_pool enable row level security;

create policy authenticated_read_sprint_exercise_pool on sprint_exercise_pool
  for select
  to authenticated
  using (true);

create index sprint_exercise_pool_slot_idx on sprint_exercise_pool (pain_point_id, slot_key);

create table sprint_day_template (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  day_number smallint not null check (day_number between 1 and 14),
  slot_key text not null,
  tier smallint not null check (tier in (1, 2)),
  slot_order smallint not null
);

alter table sprint_day_template enable row level security;

create policy authenticated_read_sprint_day_template on sprint_day_template
  for select
  to authenticated
  using (true);

create index sprint_day_template_day_idx on sprint_day_template (pain_point_id, day_number);

create table assessment_definitions (
  id uuid primary key default gen_random_uuid(),
  pain_point_id text not null references pain_points(id),
  test_key text not null,
  name text not null,
  instructions text not null,
  unit text not null,
  target_description text not null,
  better_direction text not null check (better_direction in ('lower', 'higher', 'symmetry')),
  is_bilateral boolean not null default true,
  is_synthesized boolean not null default false,
  sort_order smallint not null,
  unique (pain_point_id, test_key)
);

alter table assessment_definitions enable row level security;

create policy authenticated_read_assessment_definitions on assessment_definitions
  for select
  to authenticated
  using (true);
```

- [ ] **Step 4: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
npx supabase migration list --linked
```
Expected: all three new migrations show as applied both locally and remotely after the push.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916120000_create_pain_points.sql supabase/migrations/20260916120500_add_evidence_grade_to_exercises.sql supabase/migrations/20260916121000_create_sprint_content_schema.sql
git commit -m "feat: add pain-point and sprint content schema"
```

---

## Task 2: Personal sprint schema — sprints, days, exercises, feedback, assessments

**Files:**
- Create: `supabase/migrations/20260916130000_create_sprints.sql`
- Create: `supabase/migrations/20260916130500_create_sprint_days_and_exercises.sql`
- Create: `supabase/migrations/20260916131000_create_sprint_feedback_and_assessments.sql`

**Interfaces:**
- Consumes: `pain_points(id)`, `exercises(id)` from Task 1.
- Produces: `sprints`, `sprint_days`, `sprint_day_exercises`, `sprint_day_feedback`, `sprint_assessments`, `sprint_assessment_results` tables. Task 8 (mobile data layer) consumes all of these by name exactly as defined here.

- [ ] **Step 1: Write `20260916130000_create_sprints.sql`**

```sql
create table sprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  pain_point_id text not null references pain_points(id),
  cycle_number smallint not null,
  started_on date not null,
  status text not null check (status in ('pending_baseline', 'active', 'pending_reassessment', 'completed', 'abandoned')),
  created_at timestamptz not null default now()
);

alter table sprints enable row level security;

create policy owner_read_write_sprints on sprints
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- At most one in-flight sprint per owner -- mirrors sessions_one_active_per_owner
-- in supabase/migrations/20260623145000_expand_sessions.sql.
create unique index sprints_one_in_flight_per_owner
  on sprints (owner_id)
  where (status in ('pending_baseline', 'active', 'pending_reassessment'));
```

- [ ] **Step 2: Write `20260916130500_create_sprint_days_and_exercises.sql`**

```sql
create table sprint_days (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprints(id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 14),
  date date not null,
  completed_at timestamptz,
  unique (sprint_id, day_number)
);

alter table sprint_days enable row level security;

create policy owner_read_write_sprint_days on sprint_days
  for all
  to authenticated
  using (exists (select 1 from sprints s where s.id = sprint_days.sprint_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sprints s where s.id = sprint_days.sprint_id and s.owner_id = auth.uid()));

create table sprint_day_exercises (
  id uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references sprint_days(id) on delete cascade,
  slot_key text not null,
  tier smallint not null check (tier in (1, 2)),
  exercise_id uuid not null references exercises(id),
  prescribed_sets smallint,
  prescribed_reps_or_duration text,
  exercise_order smallint not null,
  swapped_from_exercise_id uuid references exercises(id),
  completed_at timestamptz
);

alter table sprint_day_exercises enable row level security;

create policy owner_read_write_sprint_day_exercises on sprint_day_exercises
  for all
  to authenticated
  using (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_exercises.sprint_day_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sprint_days d
      join sprints s on s.id = d.sprint_id
      where d.id = sprint_day_exercises.sprint_day_id and s.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 3: Write `20260916131000_create_sprint_feedback_and_assessments.sql`**

```sql
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
```

- [ ] **Step 4: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
npx supabase migration list --linked
```
Expected: all three new migrations show as applied both locally and remotely.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260916130000_create_sprints.sql supabase/migrations/20260916130500_create_sprint_days_and_exercises.sql supabase/migrations/20260916131000_create_sprint_feedback_and_assessments.sql
git commit -m "feat: add personal sprint lifecycle schema"
```

---

## Task 3: Content seed — Ankle

This task (and Tasks 4–6) insert fresh `exercises` rows rather than trying to
fuzzy-match names against the pre-existing 189-row catalog seeded for the old
gym-training system — that catalog's exact names weren't verified, and an
ambiguous name match (two rows with the same name) would break a
name-lookup subquery. Every row this task inserts is prefixed `"Ankle: "` so
it's unambiguous, both within this migration and for any later task that
looks it up by exact name for cross-pain-point reuse (Task 6 does this for
`"Ankle: Deep Squat Hold"`).

`movement_pattern` mapping convention used across Tasks 3–6 (the column is
check-constrained to `squat/hinge/push/pull/core/mobility/balance`, which
has no clean slot for isolated small-joint or gait work): stretches/holds →
`mobility`; balance/proprioception drills and isolated joint-strength
exercises (ankle eversion, tibialis raises, neck isometrics) → `balance`
(the catch-all, per design spec §7's open item); squat-family → `squat`;
hinge-family (RDL, glute bridge) → `hinge`; calf raises/presses → `push`;
rows/face pulls/pull-aparts → `pull`; trunk/anti-movement work (dead bug,
plank, bird dog, carries) → `core`.

**Files:**
- Create: `supabase/migrations/20260916140000_seed_ankle_content.sql`

**Interfaces:**
- Consumes: `pain_points`, `sprint_exercise_pool`, `sprint_day_template`, `assessment_definitions`, `exercises` from Tasks 1–2.
- Produces: exercise rows named `"Ankle: Deep Squat Hold"` (consumed by Task 6) among others; no other task depends on this one's exact contents beyond that single name.

- [ ] **Step 1: Write the migration**

```sql
with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Ankle: Banded Knee-to-Wall Mobilization', 'balance', 'mobility_stretch', array['ankle'], 'Self-administered mobilization-with-movement; trials show meaningful dorsiflexion gains persisting at least two days, with effects that appear mechanical rather than analgesic.', 'B', array['resistance_band'], 1, '20 reps', true, true),
    ('Ankle: Single-Leg Balance, Eyes Closed (Floor)', 'balance', 'balance', array['ankle'], 'Grade A for chronic ankle instability. The proprioceptive deficit after a lateral sprain is bilateral and does not resolve without specific balance training.', 'A', array[]::text[], 3, '30s', true, true),
    ('Ankle: Single-Leg Balance, Eyes Closed (Foam Pad)', 'balance', 'balance', array['ankle'], 'Progression of the floor variant once 30s is easy -- removing a stable surface drives further proprioceptive adaptation.', 'A', array['foam_pad'], 3, '30s', true, true),
    ('Ankle: Single-Leg Balance with Head Turns', 'balance', 'balance', array['ankle'], 'Further progression adding a vestibular/visual distraction on top of the unstable surface.', 'A', array['foam_pad'], 3, '30s', true, true),
    ('Ankle: Single-Leg Heel Raises', 'push', 'strength', array['ankle'], 'Standing heel-raise capacity is the most under-trained quality after an ankle sprain; most unrehabilitated ankles score in the teens against a 25-rep healthy threshold.', 'A', array[]::text[], 2, '15 reps', true, false),
    ('Ankle: Toe and Heel Walks', 'balance', 'balance', array['ankle'], 'Cheap tibialis-anterior and calf endurance work with a gait-pattern carryover.', 'C', array[]::text[], 1, '20m', true, false),
    ('Ankle: Banded Eversion', 'balance', 'strength', array['ankle'], 'The peroneals are the direct antagonist to the inversion sprain mechanism and are almost universally left untrained during self-managed recovery.', 'A', array['resistance_band'], 3, '15 reps', true, true),
    ('Ankle: Banded Inversion and Dorsiflexion', 'balance', 'strength', array['ankle'], 'Balances the eversion work; tibialis anterior and posterior matter for the whole kinetic chain.', 'B', array['resistance_band'], 3, '15 reps', true, false),
    ('Ankle: Weighted Single-Leg Calf Raise (Straight-Knee)', 'push', 'strength', array['ankle'], 'Heavy-slow-resistance principle applied to the gastrocnemius; progressive overload here is the single highest-value exercise for a post-sprain ankle.', 'A', array['dumbbell', 'step'], 4, '8-12 reps', true, false),
    ('Ankle: Weighted Single-Leg Calf Raise (Bent-Knee)', 'push', 'strength', array['ankle'], 'Bent-knee variant biases the soleus, which absorbs the majority of running load and is usually the weaker link.', 'A', array['dumbbell', 'step'], 4, '8-12 reps', true, false),
    ('Ankle: Wall Tibialis Raise', 'balance', 'strength', array['ankle'], 'Anterior tibialis capacity supports deceleration -- the dominant demand of lateral-movement sports.', 'B', array[]::text[], 3, '20 reps', false, false),
    ('Ankle: Wobble Board Balance', 'balance', 'balance', array['ankle'], 'Wobble-board protocols showed among the largest percentage improvements in a systematic review of chronic ankle instability rehab.', 'A', array['wobble_board'], 3, '45s', true, true),
    ('Ankle: Side-Lying Hip Abduction', 'core', 'strength', array['hip', 'ankle'], 'Hip strengthening is second only to balance work in ankle-instability rehab reviews -- the hip determines where the foot lands.', 'B', array[]::text[], 3, '12-15 reps', true, true),
    ('Ankle: Banded Lateral Walk', 'core', 'strength', array['hip', 'ankle'], 'Banded lateral walks train hip-abductor and ankle-stabilizer endurance together.', 'B', array['resistance_band'], 3, '20 steps', true, true),
    ('Ankle: Deep Squat Hold', 'squat', 'mobility_stretch', array['ankle', 'hip'], 'Loaded dorsiflexion at end range with a bodyweight stimulus.', 'A', array[]::text[], 2, '60s', false, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'ankle', 1, 'ankle-mobilization', id, 1, 1, '20 reps' from new_exercises where name = 'Ankle: Banded Knee-to-Wall Mobilization'
union all select 'ankle', 1, 'ankle-balance', id, 1, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance, Eyes Closed (Floor)'
union all select 'ankle', 1, 'ankle-balance', id, 2, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance, Eyes Closed (Foam Pad)'
union all select 'ankle', 1, 'ankle-balance', id, 3, 3, '30s' from new_exercises where name = 'Ankle: Single-Leg Balance with Head Turns'
union all select 'ankle', 1, 'ankle-calf-endurance', id, 1, 2, '15 reps' from new_exercises where name = 'Ankle: Single-Leg Heel Raises'
union all select 'ankle', 1, 'ankle-calf-endurance', id, 2, 1, '20m' from new_exercises where name = 'Ankle: Toe and Heel Walks'
union all select 'ankle', 2, 'ankle-eversion-strength', id, 1, 3, '15 reps' from new_exercises where name = 'Ankle: Banded Eversion'
union all select 'ankle', 2, 'ankle-inversion-dorsiflexion-strength', id, 1, 3, '15 reps' from new_exercises where name = 'Ankle: Banded Inversion and Dorsiflexion'
union all select 'ankle', 2, 'ankle-calf-strength-loaded', id, 1, 4, '8-12 reps' from new_exercises where name = 'Ankle: Weighted Single-Leg Calf Raise (Straight-Knee)'
union all select 'ankle', 2, 'ankle-calf-strength-loaded', id, 2, 4, '8-12 reps' from new_exercises where name = 'Ankle: Weighted Single-Leg Calf Raise (Bent-Knee)'
union all select 'ankle', 2, 'ankle-tibialis-strength', id, 1, 3, '20 reps' from new_exercises where name = 'Ankle: Wall Tibialis Raise'
union all select 'ankle', 2, 'ankle-balance-unstable', id, 1, 3, '45s' from new_exercises where name = 'Ankle: Wobble Board Balance'
union all select 'ankle', 2, 'ankle-hip-strength', id, 1, 3, '12-15 reps' from new_exercises where name = 'Ankle: Side-Lying Hip Abduction'
union all select 'ankle', 2, 'ankle-hip-strength', id, 2, 3, '20 steps' from new_exercises where name = 'Ankle: Banded Lateral Walk'
union all select 'ankle', 2, 'ankle-squat-hold', id, 1, 2, '60s' from new_exercises where name = 'Ankle: Deep Squat Hold';

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'ankle', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('ankle-mobilization', 1), ('ankle-balance', 2), ('ankle-calf-endurance', 3)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('ankle', 2, 'ankle-eversion-strength', 2, 4),
  ('ankle', 3, 'ankle-calf-strength-loaded', 2, 4),
  ('ankle', 5, 'ankle-inversion-dorsiflexion-strength', 2, 4),
  ('ankle', 6, 'ankle-tibialis-strength', 2, 4),
  ('ankle', 8, 'ankle-balance-unstable', 2, 4),
  ('ankle', 9, 'ankle-hip-strength', 2, 4),
  ('ankle', 11, 'ankle-squat-hold', 2, 4),
  ('ankle', 12, 'ankle-eversion-strength', 2, 4),
  ('ankle', 14, 'ankle-calf-strength-loaded', 2, 4);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('ankle', 'knee_to_wall', 'Weight-Bearing Lunge (Knee-to-Wall)', 'Barefoot, second toe pointed at the wall. Lunge forward keeping the heel flat until the knee touches the wall. Slide the foot back until you find the maximum distance at which the knee still touches with the heel down. Measure big toe to wall, in cm.', 'cm', 'Roughly 9-12cm is a common healthy range. Asymmetry beyond ~1.5cm vs. the other side is the meaningful signal.', 'symmetry', true, false, 1),
  ('ankle', 'heel_raise_capacity', 'Single-Leg Heel Raise Capacity', 'Standing on one leg, fingertips on a wall for balance only. Full-height heel raises at a metronome pace of one every two seconds. Count until you can no longer reach full height.', 'reps', '25+ repetitions is the widely used normative threshold.', 'higher', true, false, 2),
  ('ankle', 'balance_eyes_closed', 'Single-Leg Balance, Eyes Closed', 'Shoes off, hands on hips, non-stance foot off the ground. Time until you touch down, hop, or your hands leave your hips.', 'seconds', '30s is a reasonable target for a trained adult under 40.', 'higher', true, false, 3),
  ('ankle', 'y_balance_anterior', 'Y-Balance, Anterior Reach', 'Stand on one leg behind a line. Reach the other foot as far forward as possible, tap lightly, return without losing balance. Best of three, measured in cm.', 'cm', 'Asymmetry beyond ~4cm in the anterior direction is an established injury-risk marker.', 'symmetry', true, false, 4),
  ('ankle', 'side_hop', 'Side Hop Test (10 round trips)', 'Two lines 30cm apart. Hop laterally back and forth on one leg, 10 round trips, timed.', 'seconds', 'Within 10% side to side.', 'symmetry', true, false, 5),
  ('ankle', 'hop_for_distance', 'Single-Leg Hop for Distance', 'Hop as far as possible on one leg and stick the landing. Best of three.', 'cm', 'Limb Symmetry Index of 90% or better (injured / uninjured x 100).', 'symmetry', true, false, 6);
```

- [ ] **Step 2: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
```
Expected: migration applies with no errors. Spot-check row counts:
```bash
npx supabase db execute --linked --sql "select count(*) from sprint_exercise_pool where pain_point_id = 'ankle'; select count(*) from sprint_day_template where pain_point_id = 'ankle'; select count(*) from assessment_definitions where pain_point_id = 'ankle';"
```
Expected: `15`, `51` (42 Tier-1 rows + 9 Tier-2 rows), `6`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916140000_seed_ankle_content.sql
git commit -m "feat: seed Ankle sprint content"
```

---

## Task 4: Content seed — Rounded Shoulders

**Files:**
- Create: `supabase/migrations/20260916141000_seed_rounded_shoulders_content.sql`

**Interfaces:**
- Consumes: schema from Tasks 1–2.
- Produces: exercise rows named `"Shoulder: Face Pull"` and `"Shoulder: Band Pull-Apart"` (consumed by Task 5).

- [ ] **Step 1: Write the migration**

```sql
with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Shoulder: Thoracic Extension Over Foam Roller', 'mobility', 'mobility_stretch', array['shoulder', 'thoracic_spine'], 'Overhead elevation requires thoracic extension; restoring it usually adds available shoulder range immediately.', 'B', array['foam_roller'], 1, '10 reps', false, true),
    ('Shoulder: Wall Slide', 'balance', 'strength', array['shoulder'], 'Trains coordinated scapular upward rotation through the overhead range.', 'A', array[]::text[], 1, '12 reps', false, true),
    ('Shoulder: Band Pull-Apart', 'pull', 'strength', array['shoulder'], 'Builds capacity and coordinated pulling to reduce the pull-into-flexion posture load without treating posture itself as the target.', 'A', array['resistance_band'], 1, '20 reps', false, false),
    ('Shoulder: Passive Hang', 'balance', 'mobility_stretch', array['shoulder'], 'Loaded end-range shoulder position with a stability demand -- builds overhead tolerance efficiently.', 'B', array['pull_up_bar'], 1, '30s', false, false),
    ('Shoulder: Active Scapular Hang', 'balance', 'strength', array['shoulder'], 'Progression of the passive hang, pulling the shoulder blades down to add a strength component.', 'B', array['pull_up_bar'], 1, '20s', false, false),
    ('Shoulder: Full-Range Dumbbell Overhead Press', 'push', 'strength', array['shoulder'], 'Builds range and capacity together; loaded full-range work beats isolated band exercises for a trained population.', 'A', array['dumbbell'], 3, '8 reps', false, false),
    ('Shoulder: Prone Y Raise', 'pull', 'strength', array['shoulder'], 'One of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Prone T Raise', 'pull', 'strength', array['shoulder'], 'Second of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Prone W Raise', 'pull', 'strength', array['shoulder'], 'Third of three prone-raise variants targeting scapular movement rather than the arms.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Shoulder: Banded External Rotation at 90 Abduction', 'pull', 'strength', array['shoulder'], 'The specific joint position where throwing and overhead-smash loads occur.', 'A', array['resistance_band'], 3, '12 reps', true, false),
    ('Shoulder: Face Pull', 'pull', 'strength', array['shoulder'], 'High-elbow external rotation at the end position; upper back strength meaningfully offloads the shoulder and neck.', 'B', array['resistance_band'], 3, '15 reps', false, false),
    ('Shoulder: Bottoms-Up Kettlebell Carry', 'core', 'strength', array['shoulder'], 'Enormous stability demand at low absolute load -- excellent for rotator-cuff coordination.', 'B', array['kettlebell'], 3, '20s', true, false),
    ('Shoulder: Bottoms-Up Kettlebell Press', 'push', 'strength', array['shoulder'], 'Same stability demand as the carry variant, applied through a pressing pattern.', 'B', array['kettlebell'], 3, '6 reps', true, false),
    ('Shoulder: Serratus Wall Slide with Band', 'balance', 'strength', array['shoulder'], 'Targets scapular upward rotation specifically, the motion overhead elevation depends on most.', 'B', array['resistance_band'], 3, '12 reps', false, true)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'rounded_shoulders', 1, 'shoulder-thoracic-extension', id, 1, 1, '10 reps' from new_exercises where name = 'Shoulder: Thoracic Extension Over Foam Roller'
union all select 'rounded_shoulders', 1, 'shoulder-wall-slides', id, 1, 1, '12 reps' from new_exercises where name = 'Shoulder: Wall Slide'
union all select 'rounded_shoulders', 1, 'shoulder-band-pull-aparts', id, 1, 1, '20 reps' from new_exercises where name = 'Shoulder: Band Pull-Apart'
union all select 'rounded_shoulders', 1, 'shoulder-passive-hang', id, 1, 1, '30s' from new_exercises where name = 'Shoulder: Passive Hang'
union all select 'rounded_shoulders', 1, 'shoulder-passive-hang', id, 2, 1, '20s' from new_exercises where name = 'Shoulder: Active Scapular Hang'
union all select 'rounded_shoulders', 2, 'shoulder-overhead-press-full-range', id, 1, 3, '8 reps' from new_exercises where name = 'Shoulder: Full-Range Dumbbell Overhead Press'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 1, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone Y Raise'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 2, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone T Raise'
union all select 'rounded_shoulders', 2, 'shoulder-scapular-raises', id, 3, 3, '10 reps' from new_exercises where name = 'Shoulder: Prone W Raise'
union all select 'rounded_shoulders', 2, 'shoulder-external-rotation-90', id, 1, 3, '12 reps' from new_exercises where name = 'Shoulder: Banded External Rotation at 90 Abduction'
union all select 'rounded_shoulders', 2, 'shoulder-face-pulls', id, 1, 3, '15 reps' from new_exercises where name = 'Shoulder: Face Pull'
union all select 'rounded_shoulders', 2, 'shoulder-bottoms-up-carry-press', id, 1, 3, '20s' from new_exercises where name = 'Shoulder: Bottoms-Up Kettlebell Carry'
union all select 'rounded_shoulders', 2, 'shoulder-bottoms-up-carry-press', id, 2, 3, '6 reps' from new_exercises where name = 'Shoulder: Bottoms-Up Kettlebell Press'
union all select 'rounded_shoulders', 2, 'shoulder-serratus-wall-slides', id, 1, 3, '12 reps' from new_exercises where name = 'Shoulder: Serratus Wall Slide with Band';

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'rounded_shoulders', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('shoulder-thoracic-extension', 1), ('shoulder-wall-slides', 2), ('shoulder-band-pull-aparts', 3), ('shoulder-passive-hang', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('rounded_shoulders', 2, 'shoulder-overhead-press-full-range', 2, 5),
  ('rounded_shoulders', 3, 'shoulder-scapular-raises', 2, 5),
  ('rounded_shoulders', 5, 'shoulder-external-rotation-90', 2, 5),
  ('rounded_shoulders', 6, 'shoulder-face-pulls', 2, 5),
  ('rounded_shoulders', 8, 'shoulder-bottoms-up-carry-press', 2, 5),
  ('rounded_shoulders', 9, 'shoulder-serratus-wall-slides', 2, 5),
  ('rounded_shoulders', 11, 'shoulder-overhead-press-full-range', 2, 5),
  ('rounded_shoulders', 12, 'shoulder-scapular-raises', 2, 5),
  ('rounded_shoulders', 14, 'shoulder-face-pulls', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('rounded_shoulders', 'wall_overhead_reach', 'Wall Slide / Overhead Reach', 'Back to a wall, heels a few inches out, low back flattened against the wall. Raise both arms overhead, trying to keep wrists, elbows, and low back in contact.', 'pass/fail', 'Arms reach overhead without the low back arching off the wall.', 'higher', false, false, 1),
  ('rounded_shoulders', 'apley_scratch', 'Apley Scratch', 'Reach one hand over the shoulder down the back, the other up the back from below. Measure the gap between fingertips.', 'cm', 'Asymmetry greater than a few centimetres points to a rotational restriction on one side.', 'symmetry', true, false, 2),
  ('rounded_shoulders', 'supine_external_rotation', 'Supine External Rotation at 90', 'Lying down, shoulder abducted 90, elbow bent 90, rotate the forearm back toward the floor.', 'degrees', 'Roughly 90 to the floor.', 'symmetry', true, false, 3),
  ('rounded_shoulders', 'sleeper_stretch_ir', 'Sleeper Stretch Position (Internal Rotation)', 'Side-lying on the shoulder being tested, arm at 90, gently rotate the forearm toward the floor.', 'degrees', 'A deficit greater than ~20 compared with the other side is worth addressing.', 'symmetry', true, false, 4),
  ('rounded_shoulders', 'pushup_plus_control', 'Push-Up Plus / Scapular Control', 'In a push-up position, protract the shoulder blades at the top and retract at the bottom, slowly.', 'pass/fail', 'No winging or shrugging.', 'higher', false, false, 5);
```

- [ ] **Step 2: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
```
Expected: migration applies with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916141000_seed_rounded_shoulders_content.sql
git commit -m "feat: seed Rounded Shoulders sprint content"
```

---

## Task 5: Content seed — Nerd Neck

**Files:**
- Create: `supabase/migrations/20260916142000_seed_nerd_neck_content.sql`

**Interfaces:**
- Consumes: schema from Tasks 1–2, plus `"Shoulder: Face Pull"` and `"Shoulder: Band Pull-Apart"` from Task 4 (must run after Task 4).
- Produces: exercise row named `"Neck: Farmer's Carry"` (consumed by Task 6).

- [ ] **Step 1: Write the migration**

```sql
with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('Neck: Craniocervical Flexion Hold', 'balance', 'strength', array['neck'], 'Eight of nine trials in a systematic review supported specific low-load training of the deep cervical flexors, normalizing muscle behavior toward less superficial over-activity.', 'B', array[]::text[], 10, '10s holds', false, true),
    ('Neck: Cervical Rotation, Slow Full Range', 'mobility', 'mobility_stretch', array['neck'], 'General range-of-motion work; no forcing.', 'C', array[]::text[], 1, '10 reps each direction', false, false),
    ('Neck: Upper Trapezius and Levator Stretch', 'mobility', 'mobility_stretch', array['neck'], 'Comfort-layer stretch; local relief without a durable structural claim.', 'C', array[]::text[], 1, '30s', true, false),
    ('Neck: Thoracic Extension Over Chair Back', 'mobility', 'mobility_stretch', array['neck', 'thoracic_spine'], 'Most "neck tightness" is thoracic; thoracic mobility work is a well-replicated regional-interdependence effect on neck pain.', 'B', array[]::text[], 1, '10 reps', false, true),
    ('Neck: Four-Direction Isometric Neck Hold', 'balance', 'strength', array['neck'], 'Neck and upper-quarter strengthening is the most reliable intervention for chronic non-specific neck pain across reviews.', 'A', array[]::text[], 5, '10s holds, 4 directions', false, false),
    ('Neck: Prone Neck Extension', 'balance', 'strength', array['neck'], 'Part of the same upper-quarter-strengthening family; loaded only once bodyweight is easy.', 'A', array[]::text[], 3, '10 reps', false, false),
    ('Neck: Farmer''s Carry', 'core', 'strength', array['neck', 'shoulder'], 'Loads the entire upper quarter isometrically in an upright position; underrated for neck resilience.', 'B', array['dumbbell'], 3, '40m', false, false),
    ('Neck: Dumbbell Row', 'pull', 'strength', array['neck', 'shoulder'], 'Mid-back capacity is the foundation the neck sits on.', 'B', array['dumbbell'], 3, '10 reps', true, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'nerd_neck', 1, 'neck-craniocervical-flexion', id, 1, 10, '10s holds' from new_exercises where name = 'Neck: Craniocervical Flexion Hold'
union all select 'nerd_neck', 1, 'neck-rotation-rom', id, 1, 1, '10 reps each direction' from new_exercises where name = 'Neck: Cervical Rotation, Slow Full Range'
union all select 'nerd_neck', 1, 'neck-upper-trap-levator-stretch', id, 1, 1, '30s' from new_exercises where name = 'Neck: Upper Trapezius and Levator Stretch'
union all select 'nerd_neck', 1, 'neck-thoracic-extension', id, 1, 1, '10 reps' from new_exercises where name = 'Neck: Thoracic Extension Over Chair Back'
union all select 'nerd_neck', 2, 'neck-isometric-holds', id, 1, 5, '10s holds, 4 directions' from new_exercises where name = 'Neck: Four-Direction Isometric Neck Hold'
union all select 'nerd_neck', 2, 'neck-prone-extension', id, 1, 3, '10 reps' from new_exercises where name = 'Neck: Prone Neck Extension'
union all select 'nerd_neck', 2, 'neck-farmers-carry', id, 1, 3, '40m' from new_exercises where name = 'Neck: Farmer''s Carry'
union all select 'nerd_neck', 2, 'neck-rows', id, 1, 3, '10 reps' from new_exercises where name = 'Neck: Dumbbell Row';

insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration) values
  ('nerd_neck', 2, 'neck-face-pulls-pullaparts', (select id from exercises where name = 'Shoulder: Face Pull'), 1, 3, '15 reps'),
  ('nerd_neck', 2, 'neck-face-pulls-pullaparts', (select id from exercises where name = 'Shoulder: Band Pull-Apart'), 2, 1, '20 reps');

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'nerd_neck', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('neck-craniocervical-flexion', 1), ('neck-rotation-rom', 2), ('neck-upper-trap-levator-stretch', 3), ('neck-thoracic-extension', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('nerd_neck', 2, 'neck-isometric-holds', 2, 5),
  ('nerd_neck', 3, 'neck-prone-extension', 2, 5),
  ('nerd_neck', 5, 'neck-face-pulls-pullaparts', 2, 5),
  ('nerd_neck', 6, 'neck-farmers-carry', 2, 5),
  ('nerd_neck', 8, 'neck-rows', 2, 5),
  ('nerd_neck', 9, 'neck-isometric-holds', 2, 5),
  ('nerd_neck', 11, 'neck-prone-extension', 2, 5),
  ('nerd_neck', 12, 'neck-face-pulls-pullaparts', 2, 5),
  ('nerd_neck', 14, 'neck-farmers-carry', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('nerd_neck', 'ccf_endurance_hold', 'Craniocervical Flexion Endurance Hold', 'Lying on your back, gently nod as if saying yes, creating a slight double chin without lifting the head. Hold as long as you can maintain good form without the neck''s superficial muscles taking over.', 'seconds', 'No universal norm -- track your own trend; most untrained people fatigue well under 30s at first.', 'higher', false, true, 1),
  ('nerd_neck', 'forward_head_wall_gap', 'Forward-Head Wall/Occiput Gap', 'Stand with heels, hips, and shoulder blades against a wall. Without tipping your chin up, try to touch the back of your head to the wall. Measure the remaining gap in cm.', 'cm', 'Smaller gap generally indicates more available upper-cervical range; track trend, not an absolute target.', 'lower', false, true, 2),
  ('nerd_neck', 'cervical_rotation_rom', 'Cervical Rotation Range of Motion', 'Seated, rotate your head fully to one side without moving your shoulders, noting how far your chin travels relative to your shoulder. Repeat to the other side.', 'degrees', 'Roughly 80 degrees each side is a commonly cited normal range.', 'higher', true, true, 3);
```

- [ ] **Step 2: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
```
Expected: migration applies with no errors — confirms the cross-migration `exercises` name lookups against Task 4's rows resolved correctly (a `null` `exercise_id` would violate the `not null` constraint and fail the push).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916142000_seed_nerd_neck_content.sql
git commit -m "feat: seed Nerd Neck sprint content"
```

---

## Task 6: Content seed — Anterior Pelvic Tilt

**Files:**
- Create: `supabase/migrations/20260916143000_seed_anterior_pelvic_tilt_content.sql`

**Interfaces:**
- Consumes: schema from Tasks 1–2, plus `"Ankle: Deep Squat Hold"` from Task 3 and `"Neck: Farmer's Carry"` from Task 5 (must run after both).

- [ ] **Step 1: Write the migration**

```sql
with new_exercises as (
  insert into exercises (name, movement_pattern, exercise_type, body_parts, evidence_rationale, evidence_grade, equipment_needed, default_sets, default_rep_range, unilateral, is_corrective)
  values
    ('APT: Couch Stretch', 'mobility', 'mobility_stretch', array['hip'], 'Static hip-flexor stretching alone produces short-term extension gains via stretch tolerance; the active glute squeeze is what keeps it from dumping into lumbar extension.', 'C', array[]::text[], 1, '60s', true, true),
    ('APT: Single-Leg Glute Bridge', 'hinge', 'strength', array['hip', 'lumbar_spine'], 'Loaded hip strengthening through full range builds range and control simultaneously.', 'B', array[]::text[], 1, '12 reps', true, true),
    ('APT: Dead Bug', 'core', 'strength', array['lumbar_spine'], 'Motor-control exercise for anterior core; effective versus minimal intervention for low-back pain, low back pressed to the floor throughout.', 'B', array[]::text[], 3, '8 reps each side', true, false),
    ('APT: Modified Curl-Up', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- endurance-biased, spine-sparing anterior-core work.', 'B', array[]::text[], 3, '8s holds', false, false),
    ('APT: Romanian Deadlift', 'hinge', 'strength', array['hip', 'hamstring'], 'Loaded lengthening; builds range and strength at once and is the base-layer mobility work per the book''s central thesis.', 'A', array['dumbbell'], 3, '8 reps', false, false),
    ('APT: Bulgarian Split Squat', 'squat', 'strength', array['hip'], 'Probably the single best hip mobility-and-strength exercise available; deep, controlled, slight forward lean to bias the glute.', 'A', array['dumbbell'], 3, '8-10 reps', true, false),
    ('APT: Side Plank', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- anti-lateral-flexion trunk endurance.', 'B', array[]::text[], 3, '20-30s', true, false),
    ('APT: Bird Dog', 'core', 'strength', array['lumbar_spine'], 'One of the McGill big three -- spine-sparing, well tolerated by both flexion- and extension-intolerant back patterns.', 'B', array[]::text[], 3, '8 reps each side', true, false)
  returning id, name
)
insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration)
select 'anterior_pelvic_tilt', 1, 'apt-hip-flexor-stretch', id, 1, 1, '60s' from new_exercises where name = 'APT: Couch Stretch'
union all select 'anterior_pelvic_tilt', 1, 'apt-glute-bridge', id, 1, 1, '12 reps' from new_exercises where name = 'APT: Single-Leg Glute Bridge'
union all select 'anterior_pelvic_tilt', 1, 'apt-anterior-core', id, 1, 3, '8 reps each side' from new_exercises where name = 'APT: Dead Bug'
union all select 'anterior_pelvic_tilt', 1, 'apt-anterior-core', id, 2, 3, '8s holds' from new_exercises where name = 'APT: Modified Curl-Up'
union all select 'anterior_pelvic_tilt', 2, 'apt-loaded-hip-hinge', id, 1, 3, '8 reps' from new_exercises where name = 'APT: Romanian Deadlift'
union all select 'anterior_pelvic_tilt', 2, 'apt-split-squat', id, 1, 3, '8-10 reps' from new_exercises where name = 'APT: Bulgarian Split Squat'
union all select 'anterior_pelvic_tilt', 2, 'apt-mcgill-big-three', id, 1, 3, '20-30s' from new_exercises where name = 'APT: Side Plank'
union all select 'anterior_pelvic_tilt', 2, 'apt-mcgill-big-three', id, 2, 3, '8 reps each side' from new_exercises where name = 'APT: Bird Dog';

insert into sprint_exercise_pool (pain_point_id, tier, slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration) values
  ('anterior_pelvic_tilt', 1, 'apt-deep-squat-hold', (select id from exercises where name = 'Ankle: Deep Squat Hold'), 1, 2, '60s'),
  ('anterior_pelvic_tilt', 2, 'apt-loaded-carry', (select id from exercises where name = 'Neck: Farmer''s Carry'), 1, 3, '40m');

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order)
select 'anterior_pelvic_tilt', d, slot, 1, ord
from generate_series(1, 14) as d,
     (values ('apt-hip-flexor-stretch', 1), ('apt-glute-bridge', 2), ('apt-deep-squat-hold', 3), ('apt-anterior-core', 4)) as t(slot, ord);

insert into sprint_day_template (pain_point_id, day_number, slot_key, tier, slot_order) values
  ('anterior_pelvic_tilt', 2, 'apt-loaded-hip-hinge', 2, 5),
  ('anterior_pelvic_tilt', 3, 'apt-split-squat', 2, 5),
  ('anterior_pelvic_tilt', 5, 'apt-loaded-carry', 2, 5),
  ('anterior_pelvic_tilt', 6, 'apt-mcgill-big-three', 2, 5),
  ('anterior_pelvic_tilt', 8, 'apt-loaded-hip-hinge', 2, 5),
  ('anterior_pelvic_tilt', 9, 'apt-split-squat', 2, 5),
  ('anterior_pelvic_tilt', 11, 'apt-loaded-carry', 2, 5),
  ('anterior_pelvic_tilt', 12, 'apt-mcgill-big-three', 2, 5),
  ('anterior_pelvic_tilt', 14, 'apt-loaded-hip-hinge', 2, 5);

insert into assessment_definitions (pain_point_id, test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized, sort_order) values
  ('anterior_pelvic_tilt', 'thomas_test', 'Thomas Test (Hip Extension)', 'Sit at the edge of a table or bed, pull one knee to your chest and roll back to lying. Let the other leg hang free. Note the angle of the hanging thigh relative to horizontal.', 'degrees from horizontal', 'The hanging thigh should rest at or below horizontal. Above horizontal indicates a hip-flexor restriction that contributes to anterior pelvic tilt.', 'lower', true, false, 1),
  ('anterior_pelvic_tilt', 'standing_pelvic_tilt', 'Standing Lateral Pelvic Tilt', 'Have someone photograph you from the side in a relaxed standing posture, or use a level app against your front and back pelvic landmarks (ASIS and PSIS), to estimate the forward tilt angle.', 'degrees', 'A neutral pelvis reads close to 0; several protocols cite roughly 7-15 degrees of anterior tilt as a common non-pathological range, so track your own trend rather than chasing a universal zero.', 'lower', false, true, 2),
  ('anterior_pelvic_tilt', 'anterior_core_endurance', 'Anterior Core Endurance', 'Hold a modified curl-up or a front plank with a flat low back for as long as you can maintain the position without your low back arching.', 'seconds', 'No universal norm -- track your own trend.', 'higher', false, true, 3),
  ('anterior_pelvic_tilt', 'glute_bridge_hold', 'Single-Leg Glute Bridge Hold', 'Bridge on one leg, hold at the top with hips level. Time until cramping or the pelvis drops.', 'seconds', '30s each side without cramping in the hamstring or dropping the pelvis.', 'higher', true, false, 4);
```

- [ ] **Step 2: Push and verify**

```bash
export SUPABASE_ACCESS_TOKEN=<token from repo-root .env>
npx supabase migration list --linked
npx supabase db push --linked
```
Expected: migration applies with no errors, confirming both cross-migration name lookups resolved.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916143000_seed_anterior_pelvic_tilt_content.sql
git commit -m "feat: seed Anterior Pelvic Tilt sprint content"
```

---

## Task 7: Mobile — LRU exercise picker (pure function)

**Files:**
- Create: `apps/mobile/lib/sprintExercisePicker.ts`
- Test: `apps/mobile/lib/sprintExercisePicker.test.ts`

**Interfaces:**
- Produces: `PoolCandidate` and `TemplateRow` types, `pickExerciseForSlot(candidates, lastCompletedByExerciseId): string`, and `slotsForDay(template, dayNumber): TemplateRow[]`. Task 8 consumes all four by these exact names.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/lib/sprintExercisePicker.test.ts
import { pickExerciseForSlot, slotsForDay, type PoolCandidate, type TemplateRow } from './sprintExercisePicker';

const CANDIDATES: PoolCandidate[] = [
  { exerciseId: 'ex-a', defaultRank: 1 },
  { exerciseId: 'ex-b', defaultRank: 2 },
  { exerciseId: 'ex-c', defaultRank: 3 },
];

describe('pickExerciseForSlot', () => {
  test('a single-candidate slot always returns that candidate', () => {
    const result = pickExerciseForSlot([{ exerciseId: 'only', defaultRank: 1 }], new Map());
    expect(result).toBe('only');
  });

  test('with no history, falls back to the lowest default_rank', () => {
    const result = pickExerciseForSlot(CANDIDATES, new Map());
    expect(result).toBe('ex-a');
  });

  test('a never-completed candidate outranks any completed one, regardless of rank', () => {
    const history = new Map([
      ['ex-a', '2026-09-01'],
      ['ex-b', '2026-09-10'],
      // ex-c never completed
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-c');
  });

  test('among completed candidates, the least-recently-completed one wins', () => {
    const history = new Map([
      ['ex-a', '2026-09-10'],
      ['ex-b', '2026-09-01'],
      ['ex-c', '2026-09-05'],
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-b');
  });

  test('ties in completion recency break by default_rank ascending', () => {
    const history = new Map([
      ['ex-a', '2026-09-01'],
      ['ex-b', '2026-09-01'],
      ['ex-c', '2026-09-10'],
    ]);
    const result = pickExerciseForSlot(CANDIDATES, history);
    expect(result).toBe('ex-a');
  });

  test('throws on an empty candidate list rather than returning undefined', () => {
    expect(() => pickExerciseForSlot([], new Map())).toThrow();
  });
});

describe('slotsForDay', () => {
  const TEMPLATE: TemplateRow[] = [
    { dayNumber: 1, slotKey: 'ankle-mobilization', tier: 1, slotOrder: 1 },
    { dayNumber: 1, slotKey: 'ankle-balance', tier: 1, slotOrder: 2 },
    { dayNumber: 2, slotKey: 'ankle-eversion-strength', tier: 2, slotOrder: 4 },
  ];

  test('returns only the rows for the requested day', () => {
    expect(slotsForDay(TEMPLATE, 1)).toEqual([
      { dayNumber: 1, slotKey: 'ankle-mobilization', tier: 1, slotOrder: 1 },
      { dayNumber: 1, slotKey: 'ankle-balance', tier: 1, slotOrder: 2 },
    ]);
  });

  test('a day with no Tier-2 slot returns just its Tier-1 rows', () => {
    expect(slotsForDay(TEMPLATE, 2)).toEqual([
      { dayNumber: 2, slotKey: 'ankle-eversion-strength', tier: 2, slotOrder: 4 },
    ]);
  });

  test('a day number with no rows at all returns an empty array', () => {
    expect(slotsForDay(TEMPLATE, 7)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest sprintExercisePicker.test.ts`
Expected: FAIL with "Cannot find module './sprintExercisePicker'"

- [ ] **Step 3: Write the implementation**

```typescript
// apps/mobile/lib/sprintExercisePicker.ts
//
// The entire "engine" behind a sprint day's exercise selection: for a given
// slot, pick whichever pool candidate this owner completed least recently
// (never-completed beats any completed date), falling back to default_rank
// the first time through. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md section
// 3 -- this is deliberately the entire algorithm, no ML, consistent with
// the project's existing rules-based-engine-first principle.
export interface PoolCandidate {
  readonly exerciseId: string;
  readonly defaultRank: number;
}

/**
 * @param lastCompletedByExerciseId exerciseId -> ISO date/timestamp string
 *   of that exercise's most recent completion by this owner, across all of
 *   their past and current sprints of this pain point. A candidate absent
 *   from this map has never been completed and is treated as older than
 *   any date present in it.
 */
export function pickExerciseForSlot(
  candidates: readonly PoolCandidate[],
  lastCompletedByExerciseId: ReadonlyMap<string, string>
): string {
  if (candidates.length === 0) {
    throw new Error('pickExerciseForSlot called with an empty candidate list');
  }

  const ranked = [...candidates].sort((a, b) => {
    const aCompleted = lastCompletedByExerciseId.get(a.exerciseId);
    const bCompleted = lastCompletedByExerciseId.get(b.exerciseId);

    if (aCompleted === undefined && bCompleted === undefined) {
      return a.defaultRank - b.defaultRank;
    }
    if (aCompleted === undefined) return -1;
    if (bCompleted === undefined) return 1;
    if (aCompleted !== bCompleted) {
      return aCompleted < bCompleted ? -1 : 1;
    }
    return a.defaultRank - b.defaultRank;
  });

  return ranked[0].exerciseId;
}

export interface TemplateRow {
  readonly dayNumber: number;
  readonly slotKey: string;
  readonly tier: number;
  readonly slotOrder: number;
}

/** Filters a pain point's full 14-day template down to one day's slots. */
export function slotsForDay(template: readonly TemplateRow[], dayNumber: number): TemplateRow[] {
  return template.filter((row) => row.dayNumber === dayNumber);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest sprintExercisePicker.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/sprintExercisePicker.ts apps/mobile/lib/sprintExercisePicker.test.ts
git commit -m "feat: add least-recently-used exercise picker for sprint days"
```

---

## Task 8: Mobile — sprint data layer

**Files:**
- Create: `apps/mobile/lib/sprintLifecycle.ts`
- Test: `apps/mobile/lib/sprintLifecycle.test.ts`

**Interfaces:**
- Consumes: `pickExerciseForSlot`, `slotsForDay`, `PoolCandidate`, `TemplateRow` from Task 7 (exact names above); `localDateString` from `apps/mobile/lib/healthkitMapping.ts` (already exists, used verbatim as in `swapOptions.ts`).
- Produces: `SprintStatus`, `PainPoint`, `Sprint`, `SprintDay`, `SprintDayExercise` types and `fetchPainPoints`, `fetchInFlightSprint`, `beginSprint`, `activateSprintAfterBaseline`, `fetchTodaySprintDay`, `completeExercise`, `completeDay`, `fetchSwapCandidates`, `swapExercise`, `submitDayFeedback`, `abandonSprint` functions. Tasks 10–12 (screens) consume all of these by these exact names.

- [ ] **Step 1: Write the implementation**

```typescript
// apps/mobile/lib/sprintLifecycle.ts
//
// Data layer for the pain-point sprint flow: pain-point list, starting a
// sprint, resolving its 14 days of exercises via sprintExercisePicker's
// least-recently-used rule, fetching/completing today's day, swapping an
// exercise, and abandoning an in-flight sprint. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// sections 2, 3, and 5 for the schema and lifecycle this implements.
//
// activateSprintAfterBaseline's own day-generation loop is covered by
// manual verification (see the plan's Task 11) rather than a mocked unit
// test -- it chains many sequential Supabase calls across tables, and the
// algorithmic core it depends on (pickExerciseForSlot) already has full
// unit coverage in sprintExercisePicker.test.ts. This file's simpler,
// single-purpose functions are unit tested below.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import { pickExerciseForSlot, slotsForDay, type PoolCandidate, type TemplateRow } from './sprintExercisePicker';

export type SprintStatus = 'pending_baseline' | 'active' | 'pending_reassessment' | 'completed' | 'abandoned';

export interface PainPoint {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
}

export interface Sprint {
  readonly id: string;
  readonly painPointId: string;
  readonly cycleNumber: number;
  readonly startedOn: string;
  readonly status: SprintStatus;
}

export interface SprintDayExercise {
  readonly id: string;
  readonly slotKey: string;
  readonly tier: number;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly prescribedSets: number | null;
  readonly prescribedRepsOrDuration: string | null;
  readonly order: number;
  readonly completedAt: string | null;
}

export interface SprintDay {
  readonly id: string;
  readonly sprintId: string;
  readonly dayNumber: number;
  readonly date: string;
  readonly completedAt: string | null;
  readonly exercises: readonly SprintDayExercise[];
}

function toSprint(row: any): Sprint {
  return {
    id: row.id,
    painPointId: row.pain_point_id,
    cycleNumber: row.cycle_number,
    startedOn: row.started_on,
    status: row.status,
  };
}

function toSprintDayExercise(row: any): SprintDayExercise {
  return {
    id: row.id,
    slotKey: row.slot_key,
    tier: row.tier,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? 'Unknown exercise',
    prescribedSets: row.prescribed_sets,
    prescribedRepsOrDuration: row.prescribed_reps_or_duration,
    order: row.exercise_order,
    completedAt: row.completed_at,
  };
}

export async function fetchPainPoints(): Promise<PainPoint[]> {
  const { data, error } = await supabase
    .from('pain_points')
    .select('id, display_name, description')
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
  }));
}

export async function fetchInFlightSprint(): Promise<Sprint | null> {
  const { data, error } = await supabase
    .from('sprints')
    .select('id, pain_point_id, cycle_number, started_on, status')
    .in('status', ['pending_baseline', 'active', 'pending_reassessment'])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? toSprint(data) : null;
}

export async function beginSprint(painPointId: string): Promise<Sprint> {
  const { count, error: countError } = await supabase
    .from('sprints')
    .select('id', { count: 'exact', head: true })
    .eq('pain_point_id', painPointId);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data, error } = await supabase
    .from('sprints')
    .insert({
      pain_point_id: painPointId,
      cycle_number: (count ?? 0) + 1,
      started_on: localDateString(new Date()),
      status: 'pending_baseline',
    })
    .select('id, pain_point_id, cycle_number, started_on, status')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return toSprint(data);
}

async function fetchLastCompletedByExerciseId(painPointId: string): Promise<Map<string, string>> {
  const { data: sprintRows, error: sprintsError } = await supabase
    .from('sprints')
    .select('id')
    .eq('pain_point_id', painPointId);
  if (sprintsError) throw new Error(sprintsError.message);

  const sprintIds = ((sprintRows ?? []) as any[]).map((r) => r.id);
  if (sprintIds.length === 0) {
    return new Map();
  }

  const { data: dayRows, error: daysError } = await supabase
    .from('sprint_days')
    .select('id')
    .in('sprint_id', sprintIds);
  if (daysError) throw new Error(daysError.message);

  const dayIds = ((dayRows ?? []) as any[]).map((r) => r.id);
  if (dayIds.length === 0) {
    return new Map();
  }

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('sprint_day_exercises')
    .select('exercise_id, completed_at')
    .in('sprint_day_id', dayIds)
    .not('completed_at', 'is', null);
  if (exercisesError) throw new Error(exercisesError.message);

  const result = new Map<string, string>();
  for (const row of (exerciseRows ?? []) as any[]) {
    const existing = result.get(row.exercise_id);
    if (!existing || row.completed_at > existing) {
      result.set(row.exercise_id, row.completed_at);
    }
  }
  return result;
}

export async function activateSprintAfterBaseline(sprint: Sprint): Promise<void> {
  const { data: templateRows, error: templateError } = await supabase
    .from('sprint_day_template')
    .select('day_number, slot_key, tier, slot_order')
    .eq('pain_point_id', sprint.painPointId);
  if (templateError) throw new Error(templateError.message);

  const template: TemplateRow[] = ((templateRows ?? []) as any[]).map((row) => ({
    dayNumber: row.day_number,
    slotKey: row.slot_key,
    tier: row.tier,
    slotOrder: row.slot_order,
  }));

  const { data: pool, error: poolError } = await supabase
    .from('sprint_exercise_pool')
    .select('slot_key, exercise_id, default_rank, prescribed_sets, prescribed_reps_or_duration')
    .eq('pain_point_id', sprint.painPointId);
  if (poolError) throw new Error(poolError.message);

  const lastCompletedByExerciseId = await fetchLastCompletedByExerciseId(sprint.painPointId);

  const poolBySlot = new Map<string, any[]>();
  for (const row of (pool ?? []) as any[]) {
    const list = poolBySlot.get(row.slot_key) ?? [];
    list.push(row);
    poolBySlot.set(row.slot_key, list);
  }

  const startedOn = new Date(`${sprint.startedOn}T00:00:00`);

  for (let dayNumber = 1; dayNumber <= 14; dayNumber++) {
    const dayDate = new Date(startedOn);
    dayDate.setDate(dayDate.getDate() + dayNumber - 1);

    const { data: dayRow, error: dayError } = await supabase
      .from('sprint_days')
      .insert({ sprint_id: sprint.id, day_number: dayNumber, date: localDateString(dayDate) })
      .select('id')
      .single();
    if (dayError) throw new Error(dayError.message);

    const daySlots = slotsForDay(template, dayNumber);
    const exerciseRows = daySlots.map((slot) => {
      const candidates: PoolCandidate[] = (poolBySlot.get(slot.slotKey) ?? []).map((p) => ({
        exerciseId: p.exercise_id,
        defaultRank: p.default_rank,
      }));
      const chosenExerciseId = pickExerciseForSlot(candidates, lastCompletedByExerciseId);
      const chosenPoolRow = (poolBySlot.get(slot.slotKey) ?? []).find((p) => p.exercise_id === chosenExerciseId);

      return {
        sprint_day_id: dayRow.id,
        slot_key: slot.slotKey,
        tier: slot.tier,
        exercise_id: chosenExerciseId,
        prescribed_sets: chosenPoolRow.prescribed_sets,
        prescribed_reps_or_duration: chosenPoolRow.prescribed_reps_or_duration,
        exercise_order: slot.slotOrder,
      };
    });

    if (exerciseRows.length > 0) {
      const { error: exercisesError } = await supabase.from('sprint_day_exercises').insert(exerciseRows);
      if (exercisesError) throw new Error(exercisesError.message);
    }
  }

  const { error: activateError } = await supabase.from('sprints').update({ status: 'active' }).eq('id', sprint.id);
  if (activateError) throw new Error(activateError.message);
}

const SPRINT_DAY_EXERCISE_SELECT =
  'id, slot_key, tier, exercise_id, prescribed_sets, prescribed_reps_or_duration, exercise_order, completed_at, exercises ( name )';

export async function fetchTodaySprintDay(sprintId: string): Promise<SprintDay | null> {
  const todayIso = localDateString(new Date());
  const { data: dayRow, error: dayError } = await supabase
    .from('sprint_days')
    .select('id, sprint_id, day_number, date, completed_at')
    .eq('sprint_id', sprintId)
    .eq('date', todayIso)
    .maybeSingle();
  if (dayError) throw new Error(dayError.message);
  if (!dayRow) return null;

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('sprint_day_exercises')
    .select(SPRINT_DAY_EXERCISE_SELECT)
    .eq('sprint_day_id', (dayRow as any).id)
    .order('exercise_order');
  if (exercisesError) throw new Error(exercisesError.message);

  return {
    id: (dayRow as any).id,
    sprintId: (dayRow as any).sprint_id,
    dayNumber: (dayRow as any).day_number,
    date: (dayRow as any).date,
    completedAt: (dayRow as any).completed_at,
    exercises: ((exerciseRows ?? []) as any[]).map(toSprintDayExercise),
  };
}

export async function completeExercise(sprintDayExerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_exercises')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sprintDayExerciseId);
  if (error) throw new Error(error.message);
}

export async function completeDay(sprintDayId: string, dayNumber: number, sprintId: string): Promise<void> {
  const { error: dayError } = await supabase
    .from('sprint_days')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sprintDayId);
  if (dayError) throw new Error(dayError.message);

  if (dayNumber === 14) {
    const { error: sprintError } = await supabase
      .from('sprints')
      .update({ status: 'pending_reassessment' })
      .eq('id', sprintId);
    if (sprintError) throw new Error(sprintError.message);
  }
}

export async function fetchSwapCandidates(
  painPointId: string,
  slotKey: string,
  excludingExerciseId: string
): Promise<ReadonlyArray<{ exerciseId: string; name: string }>> {
  const { data, error } = await supabase
    .from('sprint_exercise_pool')
    .select('exercise_id, exercises ( name )')
    .eq('pain_point_id', painPointId)
    .eq('slot_key', slotKey)
    .neq('exercise_id', excludingExerciseId);

  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    exerciseId: row.exercise_id,
    name: row.exercises?.name ?? 'Unknown exercise',
  }));
}

export async function swapExercise(
  sprintDayExerciseId: string,
  currentExerciseId: string,
  newExerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_exercises')
    .update({ exercise_id: newExerciseId, swapped_from_exercise_id: currentExerciseId })
    .eq('id', sprintDayExerciseId);
  if (error) throw new Error(error.message);
}

export async function submitDayFeedback(
  sprintDayId: string,
  reaction: 'good' | 'neutral' | 'hurt',
  note: string
): Promise<void> {
  const { error } = await supabase
    .from('sprint_day_feedback')
    .upsert(
      { sprint_day_id: sprintDayId, reaction, note: note.trim() === '' ? null : note.trim() },
      { onConflict: 'sprint_day_id' }
    );
  if (error) throw new Error(error.message);
}

export async function abandonSprint(sprintId: string): Promise<void> {
  const { error } = await supabase.from('sprints').update({ status: 'abandoned' }).eq('id', sprintId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Write the test file**

```typescript
// apps/mobile/lib/sprintLifecycle.test.ts
import {
  fetchPainPoints,
  beginSprint,
  completeDay,
  swapExercise,
  abandonSprint,
  fetchSwapCandidates,
} from './sprintLifecycle';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from './supabase';

function mockChain(overrides: Record<string, any>) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'eq', 'neq', 'in', 'not', 'order', 'maybeSingle', 'single'];
  for (const method of methods) {
    chain[method] = overrides[method] ?? jest.fn(() => chain);
  }
  return chain;
}

describe('fetchPainPoints', () => {
  test('maps snake_case rows to camelCase PainPoint objects, ordered by sort_order', async () => {
    const rows = [
      { id: 'ankle', display_name: 'Ankles', description: 'Ankle stuff' },
      { id: 'nerd_neck', display_name: 'Nerd Neck', description: 'Neck stuff' },
    ];
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({ select: jest.fn(() => mockChain({ order: jest.fn(() => Promise.resolve({ data: rows, error: null })) })) })
    );

    const result = await fetchPainPoints();

    expect(result).toEqual([
      { id: 'ankle', displayName: 'Ankles', description: 'Ankle stuff' },
      { id: 'nerd_neck', displayName: 'Nerd Neck', description: 'Neck stuff' },
    ]);
  });
});

describe('beginSprint', () => {
  test('computes cycle_number as the count of this owner\'s prior sprints for that pain point, plus one', async () => {
    const insertedRow = {
      id: 'sprint-3',
      pain_point_id: 'ankle',
      cycle_number: 3,
      started_on: '2026-09-16',
      status: 'pending_baseline',
    };
    const countChain = mockChain({ eq: jest.fn(() => Promise.resolve({ count: 2, error: null })) });
    const insertChain = mockChain({
      select: jest.fn(() => mockChain({ single: jest.fn(() => Promise.resolve({ data: insertedRow, error: null })) })),
    });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockChain({ select: jest.fn(() => countChain) }))
      .mockReturnValueOnce(mockChain({ insert: jest.fn(() => insertChain) }));

    const result = await beginSprint('ankle');

    expect(result.cycleNumber).toBe(3);
    expect(result.status).toBe('pending_baseline');
  });
});

describe('completeDay', () => {
  test('updates only the day when it is not day 14', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await completeDay('day-1', 7, 'sprint-1');

    expect(supabase.from).toHaveBeenCalledWith('sprint_days');
    expect(supabase.from).not.toHaveBeenCalledWith('sprints');
  });

  test('also flips the sprint to pending_reassessment on day 14', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock).mockImplementation(() => mockChain({ update: updateSpy }));

    await completeDay('day-14', 14, 'sprint-1');

    expect(supabase.from).toHaveBeenCalledWith('sprint_days');
    expect(supabase.from).toHaveBeenCalledWith('sprints');
    expect(updateSpy).toHaveBeenCalledWith({ status: 'pending_reassessment' });
  });
});

describe('swapExercise', () => {
  test('writes the new exercise and records the swap trail', async () => {
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await swapExercise('row-1', 'old-ex', 'new-ex');

    expect(updateSpy).toHaveBeenCalledWith({ exercise_id: 'new-ex', swapped_from_exercise_id: 'old-ex' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'row-1');
  });
});

describe('fetchSwapCandidates', () => {
  test('excludes the currently-assigned exercise and maps names', async () => {
    const rows = [{ exercise_id: 'ex-b', exercises: { name: 'Alt Exercise' } }];
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({
        select: jest.fn(() =>
          mockChain({
            eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ neq: jest.fn(() => Promise.resolve({ data: rows, error: null })) })) })),
          })
        ),
      })
    );

    const result = await fetchSwapCandidates('ankle', 'ankle-balance', 'ex-a');

    expect(result).toEqual([{ exerciseId: 'ex-b', name: 'Alt Exercise' }]);
  });
});

describe('abandonSprint', () => {
  test('sets status to abandoned', async () => {
    const eqSpy = jest.fn(() => Promise.resolve({ error: null }));
    const updateSpy = jest.fn(() => mockChain({ eq: eqSpy }));
    (supabase.from as jest.Mock).mockReturnValue(mockChain({ update: updateSpy }));

    await abandonSprint('sprint-1');

    expect(updateSpy).toHaveBeenCalledWith({ status: 'abandoned' });
    expect(eqSpy).toHaveBeenCalledWith('id', 'sprint-1');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && npx jest sprintLifecycle.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/sprintLifecycle.ts apps/mobile/lib/sprintLifecycle.test.ts
git commit -m "feat: add sprint data layer (start/activate/complete/swap/abandon)"
```

---

## Task 9: Mobile — assessment data layer

**Files:**
- Create: `apps/mobile/lib/sprintAssessment.ts`
- Test: `apps/mobile/lib/sprintAssessment.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks beyond `supabase`.
- Produces: `AssessmentDefinition`, `AssessmentResultInput`, `AssessmentComparison` types and `fetchAssessmentDefinitions`, `submitAssessment`, `isAssessmentComplete`, `buildBeforeAfterComparison` functions. Task 12 (reassessment/summary screen) consumes all of these by these exact names.

- [ ] **Step 1: Write the implementation**

```typescript
// apps/mobile/lib/sprintAssessment.ts
//
// Assessment definitions (the per-pain-point test battery), submitting a
// baseline or reassessment, and the pure before/after comparison the
// summary screen renders. See design spec section 2.1/2.2 for the
// assessment_definitions/sprint_assessments/sprint_assessment_results
// schema this implements.
import { supabase } from './supabase';

export type BetterDirection = 'lower' | 'higher' | 'symmetry';

export interface AssessmentDefinition {
  readonly testKey: string;
  readonly name: string;
  readonly instructions: string;
  readonly unit: string;
  readonly targetDescription: string;
  readonly betterDirection: BetterDirection;
  readonly isBilateral: boolean;
  readonly isSynthesized: boolean;
}

export interface AssessmentResultInput {
  readonly testKey: string;
  readonly valueLeft?: number;
  readonly valueRight?: number;
  readonly valueSingle?: number;
  readonly notes?: string;
}

function toAssessmentDefinition(row: any): AssessmentDefinition {
  return {
    testKey: row.test_key,
    name: row.name,
    instructions: row.instructions,
    unit: row.unit,
    targetDescription: row.target_description,
    betterDirection: row.better_direction,
    isBilateral: row.is_bilateral,
    isSynthesized: row.is_synthesized,
  };
}

export async function fetchAssessmentDefinitions(painPointId: string): Promise<AssessmentDefinition[]> {
  const { data, error } = await supabase
    .from('assessment_definitions')
    .select('test_key, name, instructions, unit, target_description, better_direction, is_bilateral, is_synthesized')
    .eq('pain_point_id', painPointId)
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map(toAssessmentDefinition);
}

/**
 * A result is complete once every bilateral definition has both left and
 * right values, and every non-bilateral definition has a single value --
 * used to gate the assessment form's submit button.
 */
export function isAssessmentComplete(
  definitions: readonly AssessmentDefinition[],
  draft: ReadonlyMap<string, AssessmentResultInput>
): boolean {
  return definitions.every((def) => {
    const entry = draft.get(def.testKey);
    if (!entry) return false;
    return def.isBilateral
      ? entry.valueLeft !== undefined && entry.valueRight !== undefined
      : entry.valueSingle !== undefined;
  });
}

export async function submitAssessment(
  sprintId: string,
  phase: 'baseline' | 'reassessment',
  results: readonly AssessmentResultInput[]
): Promise<void> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('sprint_assessments')
    .upsert({ sprint_id: sprintId, phase, completed_at: new Date().toISOString() }, { onConflict: 'sprint_id,phase' })
    .select('id')
    .single();
  if (assessmentError) throw new Error(assessmentError.message);

  const resultRows = results.map((r) => ({
    sprint_assessment_id: (assessment as any).id,
    test_key: r.testKey,
    value_left: r.valueLeft ?? null,
    value_right: r.valueRight ?? null,
    value_single: r.valueSingle ?? null,
    notes: r.notes ?? null,
  }));

  const { error: resultsError } = await supabase
    .from('sprint_assessment_results')
    .upsert(resultRows, { onConflict: 'sprint_assessment_id,test_key' });
  if (resultsError) throw new Error(resultsError.message);

  if (phase === 'baseline') {
    const { error: activateError } = await supabase.from('sprints').update({ status: 'active' }).eq('id', sprintId);
    if (activateError) throw new Error(activateError.message);
  } else {
    const { error: completeError } = await supabase.from('sprints').update({ status: 'completed' }).eq('id', sprintId);
    if (completeError) throw new Error(completeError.message);
  }
}

export interface AssessmentComparisonValue {
  readonly left?: number;
  readonly right?: number;
  readonly single?: number;
}

export interface AssessmentComparison {
  readonly testKey: string;
  readonly name: string;
  readonly unit: string;
  readonly betterDirection: BetterDirection;
  readonly baseline: AssessmentComparisonValue | null;
  readonly reassessment: AssessmentComparisonValue | null;
}

function toComparisonValue(result: AssessmentResultInput | undefined): AssessmentComparisonValue | null {
  if (!result) return null;
  return { left: result.valueLeft, right: result.valueRight, single: result.valueSingle };
}

export function buildBeforeAfterComparison(
  definitions: readonly AssessmentDefinition[],
  baselineResults: readonly AssessmentResultInput[],
  reassessmentResults: readonly AssessmentResultInput[]
): AssessmentComparison[] {
  const baselineByKey = new Map(baselineResults.map((r) => [r.testKey, r]));
  const reassessmentByKey = new Map(reassessmentResults.map((r) => [r.testKey, r]));

  return definitions.map((def) => ({
    testKey: def.testKey,
    name: def.name,
    unit: def.unit,
    betterDirection: def.betterDirection,
    baseline: toComparisonValue(baselineByKey.get(def.testKey)),
    reassessment: toComparisonValue(reassessmentByKey.get(def.testKey)),
  }));
}
```

- [ ] **Step 2: Write the test file**

```typescript
// apps/mobile/lib/sprintAssessment.test.ts
import {
  isAssessmentComplete,
  buildBeforeAfterComparison,
  type AssessmentDefinition,
  type AssessmentResultInput,
} from './sprintAssessment';

const BILATERAL_DEF: AssessmentDefinition = {
  testKey: 'knee_to_wall',
  name: 'Knee to Wall',
  instructions: '...',
  unit: 'cm',
  targetDescription: '...',
  betterDirection: 'symmetry',
  isBilateral: true,
  isSynthesized: false,
};

const SINGLE_DEF: AssessmentDefinition = {
  testKey: 'ccf_endurance_hold',
  name: 'CCF Endurance Hold',
  instructions: '...',
  unit: 'seconds',
  targetDescription: '...',
  betterDirection: 'higher',
  isBilateral: false,
  isSynthesized: true,
};

describe('isAssessmentComplete', () => {
  test('false when a bilateral test is missing a side', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['knee_to_wall', { testKey: 'knee_to_wall', valueLeft: 10 }],
    ]);
    expect(isAssessmentComplete([BILATERAL_DEF], draft)).toBe(false);
  });

  test('true when a bilateral test has both sides', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['knee_to_wall', { testKey: 'knee_to_wall', valueLeft: 10, valueRight: 11 }],
    ]);
    expect(isAssessmentComplete([BILATERAL_DEF], draft)).toBe(true);
  });

  test('a single-value test only needs valueSingle', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['ccf_endurance_hold', { testKey: 'ccf_endurance_hold', valueSingle: 25 }],
    ]);
    expect(isAssessmentComplete([SINGLE_DEF], draft)).toBe(true);
  });

  test('false when a definition has no draft entry at all', () => {
    expect(isAssessmentComplete([SINGLE_DEF], new Map())).toBe(false);
  });
});

describe('buildBeforeAfterComparison', () => {
  test('pairs baseline and reassessment values by test_key', () => {
    const comparison = buildBeforeAfterComparison(
      [BILATERAL_DEF],
      [{ testKey: 'knee_to_wall', valueLeft: 8, valueRight: 8.5 }],
      [{ testKey: 'knee_to_wall', valueLeft: 10, valueRight: 9.5 }]
    );

    expect(comparison).toEqual([
      {
        testKey: 'knee_to_wall',
        name: 'Knee to Wall',
        unit: 'cm',
        betterDirection: 'symmetry',
        baseline: { left: 8, right: 8.5, single: undefined },
        reassessment: { left: 10, right: 9.5, single: undefined },
      },
    ]);
  });

  test('a missing reassessment value renders as null, not a crash', () => {
    const comparison = buildBeforeAfterComparison(
      [SINGLE_DEF],
      [{ testKey: 'ccf_endurance_hold', valueSingle: 15 }],
      []
    );

    expect(comparison[0].reassessment).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && npx jest sprintAssessment.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/sprintAssessment.ts apps/mobile/lib/sprintAssessment.test.ts
git commit -m "feat: add assessment data layer and before/after comparison"
```

---

## Task 10: Mobile — Home screen skeleton (picker + baseline assessment)

UI screens in this codebase aren't unit tested (no `index.tsx.test.ts` for the old Home, `trends.tsx`, etc. — only `lib/*.ts` has co-located tests); verification is `tsc`/`expo export` plus manual walkthrough, matching every prior phase's documented pattern (`CLAUDE.md`'s "clean tsc, clean bundle export" phrasing).

**Files:**
- Create: `apps/mobile/components/PainPointPicker.tsx`
- Create: `apps/mobile/components/AssessmentForm.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx` (full replacement of the old Home screen)

**Interfaces:**
- Consumes: `PainPoint`, `Sprint`, `fetchPainPoints`, `fetchInFlightSprint`, `beginSprint`, `activateSprintAfterBaseline` from Task 8; `AssessmentDefinition`, `AssessmentResultInput`, `fetchAssessmentDefinitions`, `submitAssessment`, `isAssessmentComplete` from Task 9.
- Produces: `PainPointPicker` and `AssessmentForm` components, reused unmodified by Task 11.

- [ ] **Step 1: Write `components/PainPointPicker.tsx`**

```tsx
// apps/mobile/components/PainPointPicker.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';
import type { PainPoint } from '../lib/sprintLifecycle';

export default function PainPointPicker({
  painPoints,
  onSelect,
}: {
  painPoints: readonly PainPoint[];
  onSelect: (painPoint: PainPoint) => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Pick a focus</Text>
      <Text style={sharedStyles.helperText}>One sprint at a time — 14 days, about 10 minutes a day.</Text>
      {painPoints.map((pp) => (
        <Pressable key={pp.id} style={sharedStyles.card} onPress={() => onSelect(pp)}>
          <Text style={sharedStyles.sectionTitle}>{pp.displayName}</Text>
          <Text style={sharedStyles.helperText}>{pp.description}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Write `components/AssessmentForm.tsx`**

```tsx
// apps/mobile/components/AssessmentForm.tsx
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { SPACING, sharedStyles, TYPE } from '../lib/theme';
import { isAssessmentComplete, type AssessmentDefinition, type AssessmentResultInput } from '../lib/sprintAssessment';

export default function AssessmentForm({
  title,
  definitions,
  onSubmit,
  submitting,
}: {
  title: string;
  definitions: readonly AssessmentDefinition[];
  onSubmit: (results: AssessmentResultInput[]) => void;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<Map<string, AssessmentResultInput>>(new Map());

  function updateField(testKey: string, field: 'valueLeft' | 'valueRight' | 'valueSingle', text: string) {
    const parsed = text.trim() === '' ? undefined : Number(text);
    setDraft((prev) => {
      const next = new Map(prev);
      const existing = next.get(testKey) ?? { testKey };
      next.set(testKey, { ...existing, [field]: Number.isNaN(parsed as number) ? undefined : parsed });
      return next;
    });
  }

  const complete = isAssessmentComplete(definitions, draft);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>{title}</Text>
      {definitions.map((def) => (
        <View key={def.testKey} style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>{def.name}</Text>
          <Text style={sharedStyles.helperText}>{def.instructions}</Text>
          <Text style={sharedStyles.helperText}>{def.targetDescription}</Text>
          {def.isSynthesized && (
            <Text style={sharedStyles.warningText}>
              Not from the Mobility Bible — a standard PT screening test added to cover this gap.
            </Text>
          )}
          {def.isBilateral ? (
            <View style={styles.row}>
              <TextInput
                style={[sharedStyles.textInput, styles.numberInput]}
                keyboardType="numeric"
                placeholder={`Left (${def.unit})`}
                onChangeText={(t) => updateField(def.testKey, 'valueLeft', t)}
              />
              <TextInput
                style={[sharedStyles.textInput, styles.numberInput]}
                keyboardType="numeric"
                placeholder={`Right (${def.unit})`}
                onChangeText={(t) => updateField(def.testKey, 'valueRight', t)}
              />
            </View>
          ) : (
            <TextInput
              style={sharedStyles.textInput}
              keyboardType="numeric"
              placeholder={def.unit}
              onChangeText={(t) => updateField(def.testKey, 'valueSingle', t)}
            />
          )}
        </View>
      ))}
      <Pressable
        style={sharedStyles.primaryButton}
        disabled={!complete || submitting}
        onPress={() => onSubmit(Array.from(draft.values()))}
      >
        <Text style={sharedStyles.primaryButtonText}>{submitting ? 'Saving…' : 'Submit'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm },
  numberInput: { flex: 1 },
});
```

- [ ] **Step 3: Replace `app/(tabs)/index.tsx`**

```tsx
// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (mobility sprint pivot): pain-point picker -> baseline
// assessment -> active sprint -> reassessment -> before/after summary,
// back to the picker. Replaces the old Oura-driven daily recommendation
// screen entirely. See
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// section 5 for the full state machine this implements. Task 11 fills in
// the 'active'/'pending_reassessment'/'completed' branches -- this task
// only wires 'no sprint' and 'pending_baseline'.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  type PainPoint,
  type Sprint,
} from '../../lib/sprintLifecycle';
import {
  fetchAssessmentDefinitions,
  submitAssessment,
  type AssessmentDefinition,
  type AssessmentResultInput,
} from '../../lib/sprintAssessment';
import PainPointPicker from '../../components/PainPointPicker';
import AssessmentForm from '../../components/AssessmentForm';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [definitions, setDefinitions] = useState<AssessmentDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pp, inFlight] = await Promise.all([fetchPainPoints(), fetchInFlightSprint()]);
      setPainPoints(pp);
      setSprint(inFlight);
      if (inFlight && inFlight.status === 'pending_baseline') {
        setDefinitions(await fetchAssessmentDefinitions(inFlight.painPointId));
      }
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectPainPoint(painPoint: PainPoint) {
    setLoading(true);
    try {
      const newSprint = await beginSprint(painPoint.id);
      setSprint(newSprint);
      setDefinitions(await fetchAssessmentDefinitions(painPoint.id));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not start that sprint.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitBaseline(results: AssessmentResultInput[]) {
    if (!sprint) return;
    setSubmitting(true);
    try {
      await submitAssessment(sprint.id, 'baseline', results);
      await activateSprintAfterBaseline(sprint);
      await load();
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not save your baseline.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
      </View>
    );
  }

  if (!sprint) {
    return <PainPointPicker painPoints={painPoints} onSelect={handleSelectPainPoint} />;
  }

  if (sprint.status === 'pending_baseline') {
    return (
      <AssessmentForm
        title="Baseline assessment"
        definitions={definitions}
        submitting={submitting}
        onSubmit={handleSubmitBaseline}
      />
    );
  }

  // 'active' / 'pending_reassessment' / 'completed' land here until Task 11.
  return (
    <View style={[sharedStyles.screen, styles.centered]}>
      <Text style={TYPE.body}>Sprint in progress…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 4: Verify**

```bash
cd apps/mobile
npx tsc --noEmit
npx jest
npx expo export --platform ios
```
Expected: clean typecheck, all existing + new tests pass, clean bundle export.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/PainPointPicker.tsx apps/mobile/components/AssessmentForm.tsx "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat: rebuild Home as pain-point picker + baseline assessment"
```

---

## Task 11: Mobile — active sprint, reassessment, and before/after summary

**Files:**
- Modify: `apps/mobile/lib/sprintAssessment.ts` (add `fetchAssessmentResults`)
- Modify: `apps/mobile/lib/sprintAssessment.test.ts` (test it)
- Create: `apps/mobile/components/SprintDayChecklist.tsx`
- Create: `apps/mobile/components/DayFeedbackSheet.tsx`
- Create: `apps/mobile/components/AssessmentSummary.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx` (full replacement, completing the state machine)

**Interfaces:**
- Consumes: everything from Tasks 8–10, plus the new `fetchAssessmentResults(sprintId, phase): Promise<AssessmentResultInput[]>` this task adds to `sprintAssessment.ts`.

- [ ] **Step 1: Add `fetchAssessmentResults` to `sprintAssessment.ts`**

Append to `apps/mobile/lib/sprintAssessment.ts` (after `submitAssessment`):

```typescript
export async function fetchAssessmentResults(
  sprintId: string,
  phase: 'baseline' | 'reassessment'
): Promise<AssessmentResultInput[]> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('sprint_assessments')
    .select('id')
    .eq('sprint_id', sprintId)
    .eq('phase', phase)
    .maybeSingle();
  if (assessmentError) throw new Error(assessmentError.message);
  if (!assessment) return [];

  const { data: results, error: resultsError } = await supabase
    .from('sprint_assessment_results')
    .select('test_key, value_left, value_right, value_single, notes')
    .eq('sprint_assessment_id', (assessment as any).id);
  if (resultsError) throw new Error(resultsError.message);

  return ((results ?? []) as any[]).map((row) => ({
    testKey: row.test_key,
    valueLeft: row.value_left ?? undefined,
    valueRight: row.value_right ?? undefined,
    valueSingle: row.value_single ?? undefined,
    notes: row.notes ?? undefined,
  }));
}
```

- [ ] **Step 2: Add a test for it**

Append to `apps/mobile/lib/sprintAssessment.test.ts`:

```typescript
import { fetchAssessmentResults } from './sprintAssessment';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
import { supabase } from './supabase';

describe('fetchAssessmentResults', () => {
  function mockChain(overrides: Record<string, any>) {
    const chain: any = {};
    for (const method of ['select', 'eq', 'maybeSingle']) {
      chain[method] = overrides[method] ?? jest.fn(() => chain);
    }
    return chain;
  }

  test('returns an empty array when no assessment exists for that phase yet', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({
        select: jest.fn(() =>
          mockChain({ eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })) })) })) })
        ),
      })
    );

    const result = await fetchAssessmentResults('sprint-1', 'reassessment');
    expect(result).toEqual([]);
  });

  test('maps result rows to AssessmentResultInput, undefined for unset fields', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(
        mockChain({
          select: jest.fn(() =>
            mockChain({ eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'assessment-1' }, error: null })) })) })) })
          ),
        })
      )
      .mockReturnValueOnce(
        mockChain({
          select: jest.fn(() =>
            mockChain({ eq: jest.fn(() => Promise.resolve({ data: [{ test_key: 'knee_to_wall', value_left: 8, value_right: null, value_single: null, notes: null }], error: null })) })
          ),
        })
      );

    const result = await fetchAssessmentResults('sprint-1', 'baseline');
    expect(result).toEqual([{ testKey: 'knee_to_wall', valueLeft: 8, valueRight: undefined, valueSingle: undefined, notes: undefined }]);
  });
});
```

- [ ] **Step 3: Run tests to verify**

Run: `cd apps/mobile && npx jest sprintAssessment.test.ts`
Expected: PASS, 8 tests total in this file.

- [ ] **Step 4: Write `components/SprintDayChecklist.tsx`**

```tsx
// apps/mobile/components/SprintDayChecklist.tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../lib/theme';
import type { SprintDay, SprintDayExercise } from '../lib/sprintLifecycle';

export default function SprintDayChecklist({
  day,
  onToggleExercise,
  onOpenSwap,
  onCompleteDay,
  onAbandon,
  completingDay,
}: {
  day: SprintDay;
  onToggleExercise: (exercise: SprintDayExercise) => void;
  onOpenSwap: (exercise: SprintDayExercise) => void;
  onCompleteDay: () => void;
  onAbandon: () => void;
  completingDay: boolean;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <View style={styles.headerRow}>
        <Text style={TYPE.screenTitle}>Day {day.dayNumber} of 14</Text>
        <Pressable onPress={onAbandon}>
          <Text style={styles.link}>Switch pain point</Text>
        </Pressable>
      </View>
      {day.exercises.map((exercise) => (
        <View key={exercise.id} style={sharedStyles.card}>
          <Pressable style={styles.checkRow} onPress={() => onToggleExercise(exercise)}>
            <Text style={TYPE.body}>
              {exercise.completedAt ? '☑ ' : '☐ '}
              {exercise.exerciseName}
            </Text>
          </Pressable>
          {(exercise.prescribedSets || exercise.prescribedRepsOrDuration) && (
            <Text style={sharedStyles.helperText}>
              {exercise.prescribedSets ? `${exercise.prescribedSets} x ` : ''}
              {exercise.prescribedRepsOrDuration ?? ''}
            </Text>
          )}
          <Pressable onPress={() => onOpenSwap(exercise)}>
            <Text style={styles.link}>Swap</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={sharedStyles.primaryButton} disabled={completingDay} onPress={onCompleteDay}>
        <Text style={sharedStyles.primaryButtonText}>{completingDay ? 'Saving…' : 'Complete Day'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: COLORS.accent, fontWeight: '600' },
  checkRow: { paddingVertical: SPACING.xs },
});
```

- [ ] **Step 5: Write `components/DayFeedbackSheet.tsx`**

```tsx
// apps/mobile/components/DayFeedbackSheet.tsx
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles } from '../lib/theme';

const REACTIONS: ReadonlyArray<{ id: 'good' | 'neutral' | 'hurt'; label: string }> = [
  { id: 'good', label: 'Felt good' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'hurt', label: 'That hurt' },
];

export default function DayFeedbackSheet({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (reaction: 'good' | 'neutral' | 'hurt', note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={sharedStyles.sectionTitle}>How did that feel?</Text>
          {REACTIONS.map((r) => (
            <Pressable key={r.id} style={sharedStyles.primaryButton} onPress={() => onSubmit(r.id, note)}>
              <Text style={sharedStyles.primaryButtonText}>{r.label}</Text>
            </Pressable>
          ))}
          <TextInput
            style={sharedStyles.textInput}
            placeholder="Anything worth noting? (optional)"
            value={note}
            onChangeText={setNote}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
});
```

- [ ] **Step 6: Write `components/AssessmentSummary.tsx`**

```tsx
// apps/mobile/components/AssessmentSummary.tsx
import { Pressable, ScrollView, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';
import type { AssessmentComparison, AssessmentComparisonValue } from '../lib/sprintAssessment';

function formatValue(v: AssessmentComparisonValue | null): string {
  if (!v) return '—';
  if (v.single !== undefined) return String(v.single);
  if (v.left !== undefined || v.right !== undefined) return `L ${v.left ?? '—'} / R ${v.right ?? '—'}`;
  return '—';
}

export default function AssessmentSummary({
  comparisons,
  onDone,
}: {
  comparisons: readonly AssessmentComparison[];
  onDone: () => void;
}) {
  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Before / After</Text>
      {comparisons.map((c) => (
        <View key={c.testKey} style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>{c.name}</Text>
          <Text style={TYPE.body}>
            Baseline: {formatValue(c.baseline)} {c.unit}
          </Text>
          <Text style={TYPE.body}>
            Now: {formatValue(c.reassessment)} {c.unit}
          </Text>
        </View>
      ))}
      <Pressable style={sharedStyles.primaryButton} onPress={onDone}>
        <Text style={sharedStyles.primaryButtonText}>Pick your next sprint</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 7: Replace `app/(tabs)/index.tsx` with the complete state machine**

```tsx
// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (mobility sprint pivot), complete: pain-point picker ->
// baseline assessment -> active sprint checklist (with swap + daily
// feedback) -> reassessment prompt -> reassessment form -> before/after
// summary -> back to the picker. Also carries the "Switch pain point"
// abandon escape hatch (design spec section 5) so the one-in-flight-sprint
// DB constraint never traps a user for the full 14+ days.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View, Modal, Pressable, ScrollView } from 'react-native';
import { COLORS, sharedStyles, TYPE } from '../../lib/theme';
import {
  fetchPainPoints,
  fetchInFlightSprint,
  beginSprint,
  activateSprintAfterBaseline,
  fetchTodaySprintDay,
  completeExercise,
  completeDay,
  fetchSwapCandidates,
  swapExercise,
  submitDayFeedback,
  abandonSprint,
  type PainPoint,
  type Sprint,
  type SprintDay,
  type SprintDayExercise,
} from '../../lib/sprintLifecycle';
import {
  fetchAssessmentDefinitions,
  fetchAssessmentResults,
  submitAssessment,
  buildBeforeAfterComparison,
  type AssessmentDefinition,
  type AssessmentResultInput,
  type AssessmentComparison,
} from '../../lib/sprintAssessment';
import PainPointPicker from '../../components/PainPointPicker';
import AssessmentForm from '../../components/AssessmentForm';
import SprintDayChecklist from '../../components/SprintDayChecklist';
import DayFeedbackSheet from '../../components/DayFeedbackSheet';
import AssessmentSummary from '../../components/AssessmentSummary';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [definitions, setDefinitions] = useState<AssessmentDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [today, setToday] = useState<SprintDay | null>(null);
  const [completingDay, setCompletingDay] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pendingCompleteDay, setPendingCompleteDay] = useState<SprintDay | null>(null);
  const [swapExerciseTarget, setSwapExerciseTarget] = useState<SprintDayExercise | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<ReadonlyArray<{ exerciseId: string; name: string }>>([]);
  const [comparisons, setComparisons] = useState<AssessmentComparison[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pp, inFlight] = await Promise.all([fetchPainPoints(), fetchInFlightSprint()]);
      setPainPoints(pp);
      setSprint(inFlight);
      setComparisons(null);

      if (inFlight && (inFlight.status === 'pending_baseline' || inFlight.status === 'pending_reassessment')) {
        setDefinitions(await fetchAssessmentDefinitions(inFlight.painPointId));
      }
      if (inFlight && inFlight.status === 'active') {
        setToday(await fetchTodaySprintDay(inFlight.id));
      }
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectPainPoint(painPoint: PainPoint) {
    setLoading(true);
    try {
      const newSprint = await beginSprint(painPoint.id);
      setSprint(newSprint);
      setDefinitions(await fetchAssessmentDefinitions(painPoint.id));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not start that sprint.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitBaseline(results: AssessmentResultInput[]) {
    if (!sprint) return;
    setSubmitting(true);
    try {
      await submitAssessment(sprint.id, 'baseline', results);
      await activateSprintAfterBaseline(sprint);
      await load();
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not save your baseline.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitReassessment(results: AssessmentResultInput[]) {
    if (!sprint) return;
    setSubmitting(true);
    try {
      await submitAssessment(sprint.id, 'reassessment', results);
      const [baseline, reassessment] = await Promise.all([
        fetchAssessmentResults(sprint.id, 'baseline'),
        fetchAssessmentResults(sprint.id, 'reassessment'),
      ]);
      setComparisons(buildBeforeAfterComparison(definitions, baseline, reassessment));
      setSprint((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not save your reassessment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleExercise(exercise: SprintDayExercise) {
    if (!today || !sprint) return;
    try {
      if (!exercise.completedAt) {
        await completeExercise(exercise.id);
      }
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not update that exercise.');
    }
  }

  async function handleOpenSwap(exercise: SprintDayExercise) {
    if (!sprint) return;
    try {
      const candidates = await fetchSwapCandidates(sprint.painPointId, exercise.slotKey, exercise.exerciseId);
      setSwapCandidates(candidates);
      setSwapExerciseTarget(exercise);
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not load swap options.');
    }
  }

  async function handleSelectSwap(newExerciseId: string) {
    if (!swapExerciseTarget || !sprint) return;
    try {
      await swapExercise(swapExerciseTarget.id, swapExerciseTarget.exerciseId, newExerciseId);
      setSwapExerciseTarget(null);
      setToday(await fetchTodaySprintDay(sprint.id));
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not swap that exercise.');
    }
  }

  function handleCompleteDayPress() {
    if (!today) return;
    setPendingCompleteDay(today);
    setFeedbackOpen(true);
  }

  async function handleSubmitFeedback(reaction: 'good' | 'neutral' | 'hurt', note: string) {
    if (!pendingCompleteDay || !sprint) return;
    setCompletingDay(true);
    try {
      await submitDayFeedback(pendingCompleteDay.id, reaction, note);
      await completeDay(pendingCompleteDay.id, pendingCompleteDay.dayNumber, sprint.id);
      setFeedbackOpen(false);
      setPendingCompleteDay(null);
      await load();
    } catch (err: any) {
      setLoadError(err.message ?? 'Could not save today.');
    } finally {
      setCompletingDay(false);
    }
  }

  function handleAbandon() {
    if (!sprint) return;
    Alert.alert('Switch pain point?', "You'll lose this sprint's progress.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch',
        style: 'destructive',
        onPress: async () => {
          await abandonSprint(sprint.id);
          await load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{loadError}</Text>
      </View>
    );
  }

  if (comparisons) {
    return <AssessmentSummary comparisons={comparisons} onDone={() => { setSprint(null); setComparisons(null); }} />;
  }

  if (!sprint) {
    return <PainPointPicker painPoints={painPoints} onSelect={handleSelectPainPoint} />;
  }

  if (sprint.status === 'pending_baseline') {
    return (
      <AssessmentForm title="Baseline assessment" definitions={definitions} submitting={submitting} onSubmit={handleSubmitBaseline} />
    );
  }

  if (sprint.status === 'pending_reassessment') {
    return (
      <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.sectionTitle}>Day 14 done — time to reassess</Text>
        </View>
        <AssessmentForm title="Reassessment" definitions={definitions} submitting={submitting} onSubmit={handleSubmitReassessment} />
      </ScrollView>
    );
  }

  if (sprint.status === 'active' && today) {
    return (
      <>
        <SprintDayChecklist
          day={today}
          onToggleExercise={handleToggleExercise}
          onOpenSwap={handleOpenSwap}
          onCompleteDay={handleCompleteDayPress}
          onAbandon={handleAbandon}
          completingDay={completingDay}
        />
        <DayFeedbackSheet
          visible={feedbackOpen}
          onSubmit={handleSubmitFeedback}
          onClose={() => setFeedbackOpen(false)}
        />
        <Modal visible={!!swapExerciseTarget} animationType="slide" transparent onRequestClose={() => setSwapExerciseTarget(null)}>
          <Pressable style={styles.backdrop} onPress={() => setSwapExerciseTarget(null)}>
            <View style={styles.swapSheet}>
              <Text style={sharedStyles.sectionTitle}>Swap exercise</Text>
              {swapCandidates.length === 0 && (
                <Text style={sharedStyles.helperText}>No alternatives for this slot yet.</Text>
              )}
              {swapCandidates.map((c) => (
                <Pressable key={c.exerciseId} style={styles.swapOptionRow} onPress={() => handleSelectSwap(c.exerciseId)}>
                  <Text style={TYPE.body}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <View style={[sharedStyles.screen, styles.centered]}>
      <Text style={TYPE.body}>Today's routine isn't ready yet — pull to refresh shortly.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  swapSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8 },
  swapOptionRow: { paddingVertical: 12 },
});
```

- [ ] **Step 8: Verify**

```bash
cd apps/mobile
npx tsc --noEmit
npx jest
npx expo export --platform ios
```
Expected: clean typecheck, all tests pass, clean bundle export.

- [ ] **Step 9: Manual QA checklist (record results, don't skip)**

Since a real 14-day sprint can't be waited out in one sitting, verify what's checkable now against a real signed-in test account:
1. Fresh account, no sprint: Home shows the 4-card picker.
2. Tap "Ankles": baseline assessment form renders all 6 tests with instructions/targets; submit is disabled until every field is filled.
3. Submit baseline: Home transitions to Day 1's checklist showing 3 exercises (the 3 Tier-1 slots — Day 1 has no Tier-2 slot per the seeded template).
4. Tap an exercise to check it off; tap "Swap" on one and confirm alternatives list (or "No alternatives" for a single-item slot, which is expected for most Ankle Tier-1 slots).
5. Tap "Complete Day": feedback sheet appears; submit a reaction. Confirm in Supabase directly that `sprint_days.completed_at`, `sprint_day_feedback`, and (day 1 only) no `sprints.status` change occurred yet.
6. Tap "Switch pain point": confirm the destructive-confirm dialog, confirm it, and confirm Home returns to the picker with the sprint's `status` now `abandoned` in Supabase.
7. As a shortcut for reassessment (rather than waiting 14 days), manually update one test sprint's `sprint_days` row 14's date to today and its `sprints.status` to `pending_reassessment` directly in Supabase, then confirm Home shows the "Day 14 done" reassessment form, and that submitting it shows a before/after summary with the values you entered, and "Pick your next sprint" returns to the picker.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/lib/sprintAssessment.ts apps/mobile/lib/sprintAssessment.test.ts apps/mobile/components/SprintDayChecklist.tsx apps/mobile/components/DayFeedbackSheet.tsx apps/mobile/components/AssessmentSummary.tsx "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat: complete sprint lifecycle -- active checklist, reassessment, summary"
```

---

## Task 12: Remove Logger, clean up root layout

**Files:**
- Delete: `apps/mobile/app/logger/[blockId].tsx`, `apps/mobile/app/logger/adhoc/[sessionId].tsx` (and the now-empty `apps/mobile/app/logger/` directory)
- Delete: `apps/mobile/components/ActiveSessionBanner.tsx`, `apps/mobile/components/MobilityChecklistRow.tsx`, `apps/mobile/components/StrengthSetRow.tsx`, `apps/mobile/components/ExercisePickerSheet.tsx`
- Delete (each `.ts` + its `.test.ts` where one exists): `apps/mobile/lib/sessionLifecycle.ts`(+`.test.ts`), `apps/mobile/lib/workoutActivityBridge.ts`, `apps/mobile/lib/adhocSession.ts`, `apps/mobile/lib/blockExerciseActions.ts`(+`.test.ts`), `apps/mobile/lib/loggerBlock.ts`(+`.test.ts`), `apps/mobile/lib/exerciseLogs.ts`(+`.test.ts`), `apps/mobile/lib/exerciseCatalog.ts`(+`.test.ts`), `apps/mobile/lib/homeProgram.ts`(+`.test.ts`), `apps/mobile/lib/programDisplay.ts`(+`.test.ts`), `apps/mobile/lib/dailyFeedback.ts`(+`.test.ts`), `apps/mobile/lib/swapOptions.ts`(+`.test.ts`), `apps/mobile/lib/swapTrigger.ts`(+`.test.ts`), `apps/mobile/lib/engineTrigger.ts`(+`.test.ts`), `apps/mobile/lib/yesterdaySummary.ts`(+`.test.ts`)
- Modify: `apps/mobile/app/_layout.tsx` (remove the active-session banner and its wiring; keep the dormant `recommendations` fetch and the HealthKit sync effect untouched)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. This task only removes dead surface area left behind once Home no longer starts/resumes workout sessions. `recommendations.ts`, `sessionTypeLabels.ts`, `muscleGroupVolume.ts`, `trendsHistory.ts`, `trendsRange.ts`, `trendsSummary.ts`, `units.ts`, `userPreferences.ts`, `healthkitMapping.ts`, `healthkitSync.ts` are all kept — verified in the design/investigation phase to be depended on by `trends.tsx` and/or `settings.tsx`, which stay untouched.

- [ ] **Step 1: Delete the dead files**

```bash
cd apps/mobile
rm -rf app/logger
rm components/ActiveSessionBanner.tsx components/MobilityChecklistRow.tsx components/StrengthSetRow.tsx components/ExercisePickerSheet.tsx
rm lib/sessionLifecycle.ts lib/sessionLifecycle.test.ts
rm lib/workoutActivityBridge.ts
rm lib/adhocSession.ts
rm lib/blockExerciseActions.ts lib/blockExerciseActions.test.ts
rm lib/loggerBlock.ts lib/loggerBlock.test.ts
rm lib/exerciseLogs.ts lib/exerciseLogs.test.ts
rm lib/exerciseCatalog.ts lib/exerciseCatalog.test.ts
rm lib/homeProgram.ts lib/homeProgram.test.ts
rm lib/programDisplay.ts lib/programDisplay.test.ts
rm lib/dailyFeedback.ts lib/dailyFeedback.test.ts
rm lib/swapOptions.ts lib/swapOptions.test.ts
rm lib/swapTrigger.ts lib/swapTrigger.test.ts
rm lib/engineTrigger.ts lib/engineTrigger.test.ts
rm lib/yesterdaySummary.ts lib/yesterdaySummary.test.ts
```

- [ ] **Step 2: Update `app/_layout.tsx`**

Remove the `activeSession` state, the `subscribeToActiveSessionChanges`/`fetchActiveSession`/`syncWorkoutLiveActivity`/`ActiveSessionBanner` imports and usages, and the `loadActiveSession` call sites — these all depend on files just deleted and on the now-gone Logger feature. Keep everything else (`session`, `recommendations` state/effect, HealthKit sync) exactly as-is.

```tsx
// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription and the
// HealthKit-sync/recommendations-fetch side effects. The active-session
// banner and its Logger-only wiring were removed with the mobility sprint
// pivot (Logger no longer exists) -- see
// docs/superpowers/specs/2026-09-16-mobility-sprint-pivot-design.md
// section 1's disposition table. The `recommendations` fetch below is
// intentionally left in place though nothing renders it: it's the mobile
// side of the old daily-recommendation engine, which stays running
// dormant per that same table rather than being torn out.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isHealthKitSyncEnabled, syncHealthKitWorkouts, syncHealthKitDailyMetrics } from '../lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_RECOMMENDATIONS_STATE: RecommendationsState = {
  today: null,
  yesterday: null,
  loading: true,
  error: null,
};

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsState>(
    INITIAL_RECOMMENDATIONS_STATE
  );
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadRecommendations = useCallback(async () => {
    try {
      const result = await fetchRecommendations(new Date());
      setRecommendations({
        today: result.today,
        yesterday: result.yesterday,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setRecommendations((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? 'Failed to load recommendations',
      }));
    }
  }, []);

  const runHealthKitSyncIfEnabled = useCallback(async (label: string) => {
    const enabled = await isHealthKitSyncEnabled().catch(() => false);
    if (!enabled) {
      return;
    }
    syncHealthKitWorkouts().catch((err) => {
      console.warn(`HealthKit sync failed on ${label}:`, err);
    });
    syncHealthKitDailyMetrics().catch((err) => {
      console.warn(`HealthKit daily metrics sync failed on ${label}:`, err);
    });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    runHealthKitSyncIfEnabled('launch');
    loadRecommendations();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        runHealthKitSyncIfEnabled('foreground');
        loadRecommendations();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session, loadRecommendations, runHealthKitSyncIfEnabled]);

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd apps/mobile
npx tsc --noEmit
npx jest
npx expo export --platform ios
```
Expected: clean typecheck (confirms nothing else still imports a deleted file), all remaining tests pass, clean bundle export.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Logger and its Home wiring, now replaced by the sprint flow"
```

