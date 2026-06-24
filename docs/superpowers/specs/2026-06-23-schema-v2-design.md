# Schema v2 (Phase 0) — design spec

This is the design spec for Phase 0 of the v2 build, as scoped in
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Schema v2
(Phase 0 — full detail)" section. That section is the canonical source of
truth for *what* to build; this document covers *how*, with the concrete
migration-ordering, data-safety, and RLS decisions needed to execute it
against the live production Supabase project without an outage or data
loss.

## Background

Bulletproof v1's schema
(`supabase/migrations/20260622000805_enable_extensions_and_types.sql`
through `20260622130000_rename_authenticated_rls_policies.sql`) was built
for exactly one user with one fixed program: a `session_type` enum with
`upper_a`/`upper_b`/`lower_a`/`lower_b` variants (the `_b` variants were
never actually used — confirmed against live data below), a flat
`injury_constraints` jsonb checkbox-flag object on `user_profile`, a
17-row hand-seeded `exercises` table with no goal/body-part/equipment
tagging, and RLS policies that grant the entire `authenticated` role
blanket read/write with no per-row ownership column (`recovery`,
`activity`, `sessions` from
`20260622120000_add_authenticated_rls_policies.sql`) or no policy at all
(`user_profile`, service-role-only).

v2 (full design:
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`) turns this
into a tool any user can use, with Claude reasoning over a richer profile
and exercise catalog to pick the day's actual exercises, not just the
session type. That requires: a generalized profile shape, taxonomy tables
the UI can render as dropdowns instead of hardcoded constants, a richer
exercise catalog schema (seeded for real in Phase 1, schema only here),
new child tables to persist what Claude picks (Phase 2), a simplified
`session_type` enum (the `_a`/`_b` variants are explicitly dropped per
that spec's Decision 6), and — the highest-risk part of this phase — real
multi-user RLS (`owner_id` + `auth.uid()` policies) replacing every
single-implicit-user policy, including the daily cron job's service-role
write path.

This phase is schema-only. No engine or app code changes — those are
Phases 1+. The new columns and tables this phase adds are inert until
later phases write/read them; the one functional risk surface in this
phase is the `session_type` enum rename (which existing data and the
existing `recommendations_public` view depend on) and the RLS policy
replacement (which the existing daily cron job and the two live client
apps depend on for continued read/write access).

### Live production data this migration must not break

Queried directly against the linked project (`gbtqzdjpkxpgkxjxrjoi`) via
the Supabase REST API before writing this spec:

| Table | Row count | Notes |
|---|---|---|
| `user_profile` | 1 | id `d8f1d832-d50b-4d23-962b-7272f78e2ede`, name "Sohan Updated" |
| `exercises` | 17 | the v1 seed from `20260622000812_seed_exercises.sql` |
| `recovery` | 610 | Oura history back to 2024-08-21 |
| `activity` | 668 | Oura + HealthKit workout history |
| `sessions` | 665 | `type` distribution: `rest` 496, `lower_a` 57, `upper_a` 50, `mobility` 30, `pickleball` 26, `run` 6 — **`upper_b`/`lower_b` never actually appear**, but the migration still maps them defensively since the enum allows them |
| `recommendations` | 3 | `top_pick`/`runner_up` values seen: `lower_a`, `mobility`, `upper_a` only |
| `auth.users` | 1 | id `89ac801b-5515-4388-80a7-03662030c487`, Apple Sign-In, email `smadimsetty@gmail.com` — the one real account every per-user row's `owner_id` backfill targets |

This table is the constraint the whole plan is designed around: every
step must leave these rows intact and the one real auth user able to read
exactly what they could read before.

## Goals

- Implement every schema change listed in the parent spec's "Schema v2
  (Phase 0)" section: `split_taxonomy`, `activity_taxonomy`,
  `goal_taxonomy`, `body_part_taxonomy`, the `user_profile` expansion
  (including the `injury_constraints` → `pains` rename/reshape), the
  `exercises` expansion, the `session_type` enum simplification, the new
  `recommendations` columns + `recommendation_blocks` +
  `recommendation_block_exercises` child tables, `exercise_logs`,
  `daily_feedback`, the `sessions` additions (`started_at`/`ended_at`/
  `felt_rating` + the single-active-session partial unique index), and
  real multi-user RLS (`owner_id` + `auth.uid()` policies) everywhere.
- Every new column nullable or defaulted; the existing 1-row
  `user_profile` and 17-row `exercises` seed survive unmodified in
  substance (their existing column values are untouched; only new columns
  are added around them).
- Every existing per-user row (`user_profile`, `recovery`, `activity`,
  `sessions`, `recommendations`) gets a real, non-null `owner_id`
  backfilled to the one real `auth.users` row
  (`89ac801b-5515-4388-80a7-03662030c487`) before any policy starts
  enforcing `owner_id = auth.uid()` — so the live app's existing
  authenticated session keeps working with zero downtime.
- The daily cron job's service-role write path
  (`engine/run_daily.py`, which writes `recovery`/`activity`/
  `sessions`/`recommendations` using the service-role key) keeps working
  exactly as today: the service role bypasses RLS by Postgres/Supabase
  design regardless of which policies exist, so this phase adds no
  service-role-specific policy, it just must not accidentally break that
  bypass (e.g. by revoking a table-level grant rather than scoping a
  policy).
- The `session_type` enum rename follows the standard Postgres
  create-new-type → `CASE`-map data → drop old type → rename pattern
  (never `ALTER TYPE ... DROP VALUE`, which does not exist), applied
  consistently to `sessions.type`, `recommendations.top_pick`/
  `runner_up`, and the `recommendations_public` view's column list (no
  shape change to the view's 5 columns, just type changes underneath).
- Every new migration is verified by actually running it against the
  linked production project (`npx supabase db push`) and re-checking row
  counts/values, not just reviewed by eye.

## Non-goals (explicitly out of scope for this phase)

- Any engine code (`engine/scoring.py`, `engine/rationale.py`,
  `engine/run_daily.py`) or app code
  (`apps/mobile/`, `apps/web/`) changes. The new tables/columns are inert
  until Phase 2 (engine) and later phases (mobile UI) write/read them.
  This phase explicitly does **not** update `engine/rationale.py`'s
  `_SIGNAL_LABELS` dict or `apps/*/lib/sessionTypeLabels.ts` even though
  both reference the old `upper_a`/`lower_a` string values — they keep
  working today because the simplified enum still includes `upper`/
  `lower` as members (just not the `_a`/`_b` suffix), so existing code
  that does `session_type.startswith("upper")`-style pattern matching is
  unaffected; exact-string lookups against `"upper_a"` specifically would
  break, but that's a Phase 2 concern to fix alongside the engine
  rewrite, not this phase's to silently patch around.
- The actual exercise catalog content/reseed (Phase 1 — "a curated
  one-time seed... reviewed by Sohan before going live"). This phase adds
  the new `exercises` columns (nullable/defaulted) but does not populate
  them for the existing 17 rows beyond leaving them at their defaults
  (`null`/`false` as appropriate).
- Populating `recommendation_blocks`/`recommendation_block_exercises`/
  `exercise_logs`/`daily_feedback` with any data — these are new, empty
  tables until Phase 2+ writes to them.
- Any taxonomy row beyond the spec's explicit seed lists. No speculative
  extra rows.
- Changing `recommendations_public`'s public contract (still exactly
  `date, top_pick, runner_up, public_rationale, generated_at`) — the
  parent spec is explicit this stays frozen.
- A CLAUDE.md v2 addendum documenting the rules-vs-LLM philosophy change
  — that's called out in the parent spec as a documentation task tied to
  Phase 2's engine decisions, not this schema phase.
- Local Supabase stack verification (`supabase start`/Docker). Verification
  in this phase runs directly against the linked remote project per the
  Global Constraints in the implementation plan — there is no local
  Postgres instance set up in this worktree, and the whole point of this
  phase's verification is confirming the migration is safe against the
  *actual* production data inventoried above, not a clean local
  approximation of it.

## Decisions

Ambiguities resolved here since this phase runs autonomously with no
mid-build questions:

### 1. Migration file granularity: one file per table/concern, matching v1's existing one-migration-per-`CREATE TABLE` convention

v1's 12 migrations average roughly one per table or one per fix. v2
follows the same grain rather than one giant migration: each new
taxonomy table is its own create+seed pair (mirroring
`20260622000809_create_exercises.sql` +
`20260622000812_seed_exercises.sql`'s split between DDL and seed data),
the enum rename is its own dedicated file (it is the riskiest single
operation in this phase and deserves isolation for easy rollback/review),
and the RLS rework is grouped into one file per logical unit (owner_id
backfill, then policy replacement) rather than scattered across the
table-creation files — this mirrors v1's own pattern of doing RLS as a
distinct later pass (`20260622120000_add_authenticated_rls_policies.sql`
came after every `create table` migration, not inline with them).

### 2. `owner_id` backfill strategy: add nullable → backfill to the one real user → set `not null default auth.uid()`

The parent spec's exact wording is `owner_id uuid references auth.users
not null default auth.uid()`. Adding a `not null` column with no default
to a table with existing rows fails outright; adding it with `default
auth.uid()` still fails for existing rows because `auth.uid()` evaluates
to `null` outside of an authenticated request context (a migration runs
as the Postgres superuser/migration role, not as an authenticated
Supabase user). The safe sequence, applied identically to every per-user
table: `alter table ... add column owner_id uuid references
auth.users(id)` (nullable, no default yet) → `update ... set owner_id =
'89ac801b-5515-4388-80a7-03662030c487'` (the one real user, hardcoded
literal — this is a one-time production data backfill, not a reusable
pattern, so a literal is correct and more honest than pretending it's
parameterized) → `alter table ... alter column owner_id set not null,
alter column owner_id set default auth.uid()`. The `default auth.uid()`
only matters for *future* inserts from an authenticated client session
(mobile app writes); the cron job's service-role inserts will continue to
explicitly pass nothing for `owner_id` only if service-role inserts also
target the one real user — see Decision 4.

### 3. Which tables get `owner_id`: exactly the parent spec's list, `recommendations` included despite its public view

`user_profile`, `recovery`, `activity`, `sessions`, `recommendations`,
`exercise_logs`, `daily_feedback` — per the parent spec's explicit list.
`recommendations` getting `owner_id` does not change
`recommendations_public`'s contract: the view's `select` list stays the
5 frozen columns, never `owner_id`, so anonymous readers never see whose
recommendation it is. The base table's new `owner_id`-scoped policy only
gates direct base-table access (service role + the owning authenticated
user), which is consistent with `recommendations` already having "no
anon/authenticated policies on the base table" today.

### 4. The cron job's service-role writes: no change needed, but its inserts must include `owner_id` going forward

The service role bypasses RLS entirely (a Postgres/Supabase-level
property of the `service_role` Postgres role having `BYPASSRLS`, not
something any policy in this migration grants or revokes) — so
`engine/run_daily.py`'s existing service-role writes to
`recovery`/`activity`/`sessions`/`recommendations` keep working
unmodified by this migration alone. However, once `owner_id` is `not
null`, a service-role insert that omits `owner_id` entirely will fail the
`not null` constraint (constraints apply regardless of RLS bypass). Since
`auth.uid()` evaluates to `null` for a service-role request (no
authenticated user session backs it), the column's `default auth.uid()`
will not save a service-role insert that omits the column. **This is a
real, intentional gap this phase flags rather than silently works around
in SQL**: `engine/run_daily.py` will need a one-line change (pass
`owner_id="89ac801b-5515-4388-80a7-03662030c487"` explicitly in its
insert payloads) before its first post-migration run, or every cron
write will start failing the `not null` constraint. That code change is
explicitly **out of scope for this schema-only phase** (per Non-goals —
no engine code changes here) but is called out as a blocking
known-follow-up in the implementation plan's final verification task so
it is never silently lost between phases.

### 5. `pains` jsonb-array shape and the `injury_constraints` rename

The parent spec specifies `jsonb array of {body_part, severity (1-10),
note, since}`. The existing single row's `injury_constraints` value
(`{neck: {...}, ankles: {...}, hips_hamstrings: {...},
right_dominance: {...}}`, a flat object keyed by body-part name) is
reshaped into that array format as part of the rename migration — `alter
table ... rename column injury_constraints to pains` followed by an
`update` that rewrites the one existing row's value into the new array
shape, mapping each of the 4 existing keys to one array entry (`severity`
defaulted to `5` — a reasonable mid-point placeholder since the original
flat shape carried no numeric severity, just a boolean `active` flag
which is dropped entirely since every existing entry has `active: true`
anyway; `since` defaulted to `null` since the original data has no onset
date). This is a one-row, one-time data transform — not a generic
flat-to-array converter — so it is written as a literal `jsonb` value in
the migration, consistent with Decision 2's "literal is more honest than
pretending it's parameterized" reasoning.

### 6. `session_type` enum rename mechanics: `session_type_v2`, explicit 4-way `CASE`, applied to 2 tables + 1 view

Standard Postgres pattern, in this exact order within one migration file:
1. `create type session_type_v2 as enum ('upper','lower','pickleball','run','rest','mobility')`.
2. Drop `recommendations_public` (it depends on `recommendations.top_pick`/
   `runner_up`'s type and must be dropped before those columns can change
   type, then recreated identically afterward — same pattern already
   established in `20260622002432_fix_view_security_and_updated_at_triggers.sql`,
   which dropped and recreated this same view for an unrelated reason).
3. `alter table sessions alter column type type session_type_v2 using (case type when 'upper_a' then 'upper'::session_type_v2 when 'upper_b' then 'upper'::session_type_v2 when 'lower_a' then 'lower'::session_type_v2 when 'lower_b' then 'lower'::session_type_v2 else type::text::session_type_v2 end)` — the `else` branch handles `pickleball`/`run`/`rest`/`mobility` which map 1:1 by name and need no explicit `CASE` arm.
4. Same `alter column ... using (case ...)` pattern for
   `recommendations.top_pick` (not nullable) and `recommendations.runner_up`
   (nullable — the `CASE`'s implicit `null` passthrough for a `null` input
   is correct, no extra handling needed).
5. `drop type session_type`.
6. `alter type session_type_v2 rename to session_type`.
7. Recreate `recommendations_public` with the exact same definition as
   `20260622002432_fix_view_security_and_updated_at_triggers.sql` left it
   (`security_invoker = false`, same 5-column select, same grants to
   `anon, authenticated`) — the view's column *types* change underneath
   (old enum → new enum) but its name, shape, and security model are
   byte-for-byte identical to before.

### 7. Taxonomy tables and `exercises` stay globally readable, write-restricted to service role

Per the parent spec: "Taxonomy tables and exercises stay global/shared
(read-only to authenticated, write via service role only)." Each new
taxonomy table (`split_taxonomy`, `activity_taxonomy`, `goal_taxonomy`,
`body_part_taxonomy`) gets RLS enabled with exactly one policy: `for
select to authenticated using (true)` (no `anon` grant — these are
Settings-screen dropdown data behind the app's auth gate, unlike
`exercises`, which already explicitly grants `anon` select because the
public web dashboard's recommendation links to it). No insert/update/
delete policy is added for any role — service role bypasses RLS for the
one-time seed inserts in this migration and any future admin reseed, and
no other role should ever write to these tables, consistent with "write
via service role only" meaning *no* policy grants non-service-role
writes, not an explicit deny policy (Postgres RLS defaults to deny when a
table has RLS enabled and no matching policy exists for the attempted
operation/role).

`exercises` keeps its existing `anon_can_read_exercises` policy
unchanged (still needed for the public web dashboard) and gains no new
write policy — same reasoning.

### 8. `recommendation_blocks`/`recommendation_block_exercises`/`exercise_logs`/`daily_feedback` RLS: scoped through the parent row's `owner_id`, not their own `owner_id` column

`recommendation_blocks` has no `owner_id` of its own per the parent
spec's column list (`id, recommendation_id FK, block_order, block_type,
split_day_label, title, estimated_minutes`) — it is owned transitively
through `recommendations.owner_id`. Its policy uses an `exists` subquery
against the parent: `using (exists (select 1 from recommendations r
where r.id = recommendation_blocks.recommendation_id and r.owner_id =
auth.uid()))`, and the same pattern one level deeper for
`recommendation_block_exercises` (through `recommendation_blocks` →
`recommendations`). `exercise_logs` and `daily_feedback` do get their own
`owner_id` column directly (per the parent spec's explicit column lists
for both), so they follow the simple direct-`owner_id` policy pattern
like `recovery`/`activity`/`sessions`.

### 9. Partial unique index for single-active-session: index name and exact predicate

`create unique index sessions_one_active_per_owner on sessions (owner_id)
where (ended_at is null)`. This is a partial unique index, not a
table-level constraint, because the "uniqueness" only applies to the
subset of rows where `ended_at is null` — Postgres partial unique indexes
are the standard mechanism for "at most one row matching a condition"
constraints. Existing historical session rows (665 of them, all
presumably already "ended" in the sense that they're past-dated reconstructed
history with no real `started_at`/`ended_at` concept) all have `ended_at
null` today since the column doesn't exist yet pre-migration — once
added, every existing row's `ended_at` defaults to `null` (the column has
no default value specified for new rows, but for pre-existing rows added
via `add column`, Postgres backfills the column with `null` for every row
unless a `default` is given). **This means the index, if created naively,
would immediately fail** — 665 existing rows would all have `ended_at is
null` simultaneously, violating "at most one." The migration must backfill
`ended_at` for all existing rows to a non-null value (e.g. `ended_at =
started_at` is wrong since `started_at` is also new/null — instead backfill
both `started_at` and `ended_at` to `date::timestamptz` for every existing
row, representing "this historical session has already concluded," which is
true for all 665 of them) **before** creating the partial unique index, in
the same migration, ordered: add columns nullable → backfill existing rows'
`started_at`/`ended_at` → create the partial index. This is the single
trickiest data-safety detail in this phase and is called out explicitly
in the implementation plan rather than left implicit.

### 10. `default_rep_range` type: `text`, not a structured type

The parent spec says `default_rep_range text`. Kept as free-form text
(e.g. `"8-12"`, `"30-60s hold"`) rather than a min/max integer pair,
because mobility/stretch exercises need non-numeric reps (time-based
holds), and Phase 1's actual seed content (out of scope here) is the
right place to decide on a display convention, not this schema phase.

### 11. `exercise_type` check constraint values: exactly the parent spec's 5, no extras

`check (exercise_type in ('strength', 'mobility_stretch', 'plyometric',
'balance', 'cardio'))` — copied verbatim from the parent spec's Schema v2
section, no additions. `body_parts`/`target_goals`/`equipment_needed` are
left as unconstrained `text[]` (no check constraint, no FK to the new
taxonomy tables) because Postgres has no native "array elements must
reference a taxonomy table" constraint short of a trigger, and adding a
trigger for application-level data integrity on a column that won't be
populated with real data until Phase 1 is speculative work this phase
should not take on — the parent spec's engine design (Phase 2) already
treats these as soft/app-validated tags, not hard FKs.

### 12. `split_day_label` on `recommendation_blocks`: free `text`, not an FK to `split_taxonomy.day_labels`

`split_taxonomy.day_labels` is a `text[]` column (per the parent spec:
`day_labels text[] ordered`), and Postgres cannot express a foreign key
from a scalar column into an element of another row's array column.
`recommendation_blocks.split_day_label` stays plain nullable `text` (per
the parent spec's own column list, which already specifies it as
nullable with no FK) — application code (Phase 2's `program_builder.py`)
is responsible for only ever writing a value that's actually a member of
the user's `preferred_split`'s `day_labels` array.

## Approach (migration file sequence)

Twelve new migration files, in this order (later files in the sequence
depend on earlier ones — e.g. the `pains` rename must land before
`user_profile`'s other new columns reference nothing from it, but
`split_taxonomy` must exist before `user_profile.preferred_split`'s FK can
be added):

1. `split_taxonomy` create + seed (4 rows).
2. `activity_taxonomy` create + seed (per spec: `strength_training`,
   `pickleball`, `tennis`, `running`, `yoga`, `mobility`, `walking`).
3. `goal_taxonomy` create + seed (6 rows: aesthetic physique, mobility/
   flexibility, total-body resilience, strength/power, endurance,
   longevity/recovery).
4. `body_part_taxonomy` create + seed (11 rows + "other").
5. `user_profile` expansion: `owner_id` backfill (Decision 2) +
   `injury_constraints` → `pains` rename/reshape (Decision 5) + every
   other new column (`activities`, `preferred_split` FK, `current_goals`,
   `training_frequency_mode`/`manual`, `diet_preference`, `weight_kg`,
   `birth_date`, `location`, `healthkit_sync_enabled`).
6. `exercises` expansion: 9 new nullable/defaulted columns, no data
   backfill needed (existing 17 rows simply get nulls/defaults).
7. `session_type` enum rename (Decision 6) — touches `sessions.type`,
   `recommendations.top_pick`/`runner_up`, `recommendations_public`.
8. `recommendations` new columns (`program_generated_by`, `claude_model`,
   `claude_usage`) + `owner_id` backfill.
9. `recommendation_blocks` + `recommendation_block_exercises` create
   (empty, no seed — new tables with no historical equivalent).
10. `exercise_logs` create (empty) + `daily_feedback` create (empty),
    both with their own `owner_id` column from creation (no backfill
    needed since they start empty).
11. `sessions` additions: `started_at`/`ended_at`/`felt_rating` +
    backfill (Decision 9) + partial unique index + `owner_id` backfill.
12. RLS policy replacement: drop the 4 blanket single-user policies from
    `20260622130000_rename_authenticated_rls_policies.sql`
    (`authenticated_read_write_recovery/activity/sessions`,
    `authenticated_read_recommendations`), replace with real
    `owner_id = auth.uid()`-scoped policies on
    `recovery`/`activity`/`sessions`/`recommendations`/`user_profile`/
    `exercise_logs`/`daily_feedback`, plus the transitive-ownership
    policies for `recommendation_blocks`/`recommendation_block_exercises`
    (Decision 8), plus the read-only-authenticated policies for the 4 new
    taxonomy tables (Decision 7).

Each file is verified independently against the linked remote project
(`npx supabase db push`, then a REST-API spot-check of row counts/values)
before moving to the next — never batched and pushed all at once
untested, given how much real production data this phase touches.

## Out of scope

See Non-goals above. Restated for emphasis since this is an autonomous,
unattended phase: no engine code, no app code, no exercise content
seeding beyond schema/nullable-column scaffolding, no CLAUDE.md
philosophy addendum, no local Supabase/Docker verification path. The
single explicitly-flagged follow-up that must not be lost is Decision
4's `engine/run_daily.py` service-role-insert `owner_id` fix, required
before the next cron run after this migration merges.
