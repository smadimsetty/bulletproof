# Exercise DB seed (Phase 1) — design spec

This is the design spec for Phase 1 of the v2 build, as scoped in
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s Decision 3
("Exercise DB v1 is a curated one-time seed... reviewed by Sohan before
going live as a real migration. Not a runtime/scheduled pipeline.") and
Non-goal 1 ("An automated, self-updating exercise-research pipeline... Phase
1 only."). That parent spec defines *what* the `exercises` table's v2 shape
is (already live — see Critical files below); this document covers *how*
Phase 1 actually researches, tags, and ships 100-200 real exercise rows into
it, plus how an autonomous pipeline run (no interactive Sohan review
available) gets an acceptance gate that substitutes for that review.

## Background

`supabase/migrations/20260622000809_create_exercises.sql` created the base
`exercises` table (`id, name, movement_pattern, demo_video_url, is_complex,
created_at`) and `20260622000812_seed_exercises.sql` seeded it with the 17
hand-picked v1 rows — the Thursday mobility block, Nordic curl, ATG split
squat, Copenhagen plank, Jefferson curl, etc., copied verbatim from
CLAUDE.md's "non-negotiables." None of these 17 rows have a
`demo_video_url`, and `movement_pattern` is constrained to 7 values
(`squat, hinge, push, pull, core, mobility, balance`).

`supabase/migrations/20260623142500_expand_exercises.sql` (merged as part
of Phase 0/schema-v2, already live in production) added 9 new nullable/
defaulted columns — `exercise_type`, `target_goals text[]`, `body_parts
text[]`, `evidence_rationale`, `equipment_needed text[]`, `default_sets`,
`default_rep_range`, `unilateral`, `is_corrective` — but populated none of
them. All 17 existing rows currently sit at the column defaults (`null`/
`false`/`[]`).

Phase 2 (the Claude program-builder, not yet built) needs a real catalog to
select from: it filters/ranks exercises by `movement_pattern`,
`target_goals`, `body_parts`, `equipment_needed`, and `is_corrective`, and
its prompt includes a catalog excerpt and demo-video links. An empty or
under-tagged catalog makes Phase 2 unbuildable in any meaningful way — this
is explicitly called out in the parent spec's phase-dependency note ("1
(exercise seed) blocks 2 (Claude can't select from an empty/untagged DB)").

This phase is the one-time research-and-tag pass that fills that gap. It is
explicitly **not** a runtime pipeline — no scheduled job, no Claude-at-
request-time lookup, no auto-refresh. It runs once, produces a reviewed CSV
and a migration, and Phase 2 reads a static, already-tagged table from then
on.

### Why this phase can't get Sohan's interactive review (and what replaces it)

The parent spec's Decision 3 says the seed should be "reviewed by Sohan
before going live." This phase runs inside the unattended autonomous
pipeline (`docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md`),
which has no mechanism for a mid-run pause to collect human feedback short
of the pipeline's one documented pause point (the money-spend gate, which
does not apply here — no paid API calls or infra changes in this phase).
Per this Planning agent's own dispatch instructions: "You will not get to
ask Sohan for spot-check approval interactively in this pipeline run;
instead, write a validation script... and treat that script passing as the
acceptance gate in place of a manual review."

This spec treats that substitution as a real design decision with real
consequences, not a formality: the validation script (Task in the
implementation plan) is the actual gate this phase is held to. It checks
structural completeness (every `goal_taxonomy`/`body_part_taxonomy` id has
enough tagged coverage, every `movement_pattern` x `exercise_type`
combination that should exist does, corrective coverage minimums per pain
area) — it cannot check subjective exercise-selection quality (is this
*the right* hamstring exercise, is this demo video *actually* showing the
named exercise) the way Sohan's eyes would. That gap is accepted and
explicitly named in Non-goals below, not hidden.

## Goals

- Research and tag 100-200 exercises, written first as a reviewable draft
  CSV at `supabase/seed/exercise-catalog-v2-draft.csv`, then as a real SQL
  migration.
- Equipment variants are separate rows. "Incline Dumbbell Press," "Incline
  Barbell Press," and "Incline Smith Machine Press" are three distinct
  rows with three distinct names and (where findable) three distinct demo
  videos — never one row with an equipment array.
- Cover every `movement_pattern` x `exercise_type` combination that
  reasonably exists (e.g. `squat` x `strength`, `mobility` x
  `mobility_stretch`, `core` x `plyometric` if a real exercise fits it) —
  not necessarily literally every mathematical combination (some, like
  `balance` x `cardio`, may have zero real-world exercises and are
  legitimately left uncovered; see Decisions).
- Real demo video URLs sourced via web search wherever findable, attached
  to `demo_video_url`. Not every row will have one — see Decisions for the
  honesty bar here.
- At least 3-5 `is_corrective = true` exercises per pain-relevant body
  part (`neck`, `ankles`, `hips`, `hamstrings`, `shoulders`), building on
  CLAUDE.md's existing non-negotiables (banded ankle distraction, chin
  tucks, Nordic curl, etc. become the first corrective entries for their
  respective body parts, not duplicated).
- Backfill the original 17 v1 rows' new v2 columns in the same migration —
  they do not stay under-tagged. They get real `exercise_type`,
  `target_goals`, `body_parts`, `evidence_rationale`,
  `equipment_needed`, `default_sets`, `default_rep_range`, `unilateral`,
  `is_corrective` values, consistent with the same research pass applied
  to every new row.
- A validation script (`engine/tests/test_exercise_catalog.py`) that
  queries the live post-migration table and asserts coverage minimums per
  taxonomy id, runnable both as a pytest test and standalone. This script
  passing is this phase's acceptance gate.
- A real migration file, following this repo's existing migration
  conventions, applied to the linked production Supabase project and
  verified against live row counts — consistent with how Phase 0 verified
  every migration in this same pipeline.

## Non-goals (explicitly out of scope for this phase)

- **Subjective exercise-selection or demo-video-accuracy review.** The
  validation script checks structural/coverage completeness, not "is this
  the single best hamstring exercise" or "does this YouTube link actually
  show the named movement performed correctly." That judgment call
  normally belongs to Sohan's interactive review (parent spec Decision 3)
  and is explicitly not available in this pipeline run. The draft CSV is
  still written to a stable, easy-to-diff path specifically so a human can
  review it after the fact if desired — this phase does not delete that
  option, it just doesn't block on it.
- **A runtime or scheduled research pipeline.** This is a one-time pass.
  No code in this phase calls a web-search or LLM API at request time, on
  a schedule, or on every Phase 2 invocation. If Phase 2 someday wants
  fresher/expanded exercise data, that is a new, separately-scoped
  decision — not an extension of this phase's script.
- **FK constraints from `exercises.target_goals`/`body_parts`/
  `equipment_needed` into the taxonomy tables.** Per schema-v2 Design
  Decision 11 (already-merged, not reopened here): Postgres cannot
  natively constrain array elements against another table's rows, and the
  v2 engine design already treats these as soft/app-validated tags. This
  phase's validation script is the practical substitute — it checks that
  every tag value actually used across the catalog is a real
  `goal_taxonomy`/`body_part_taxonomy` id (catching typos), without adding
  a DB-level constraint.
- **Editing `engine/`, `apps/mobile/`, or `apps/web/` code.** Phase 2
  reads this table; this phase only populates it. No program-builder code
  exists yet to wire up.
- **`movement_pattern` or `exercise_type` enum/check-constraint changes.**
  Both already exist as fixed check constraints from earlier migrations
  (`movement_pattern in ('squat','hinge','push','pull','core','mobility','balance')`,
  `exercise_type in ('strength','mobility_stretch','plyometric','balance','cardio')`).
  This phase tags rows using only these existing values — it does not add
  new pattern or type values, even if research surfaces an exercise that
  fits awkwardly (see Decisions for how awkward fits are resolved).
- **Renaming or removing any of the 17 v1 rows.** They are backfilled in
  place (same `id`, same `name`, same `movement_pattern`,
  `demo_video_url`, `is_complex`), never replaced or duplicated under a
  near-identical name.
- **Local Supabase/Docker verification.** Same reasoning as Phase 0's
  schema design spec: this worktree has no local Postgres instance, and
  verification runs directly against the linked remote project.

## Decisions

Ambiguities resolved here since this phase runs autonomously, with no
mid-build questions back to Sohan.

### 1. Row count target: 172 new rows (within the 100-200 range), allocated by movement_pattern coverage first, then breadth

172 new rows (plus the 17 backfilled v1 rows, 189 total in the table after
this migration) landed near the upper-middle of the spec's 100-200 range
once every realistic `movement_pattern` x `exercise_type` combination and
every equipment-variant family was actually researched — not a number
picked in advance and filled to. Allocation in practice: every
`movement_pattern` (7 values) gets coverage across its realistic
`exercise_type` values, weighted toward `strength` (the largest real-world
category: squat/hinge/push/pull variants across barbell/dumbbell/machine/
bodyweight equipment) and `mobility_stretch` (CLAUDE.md's heaviest
non-negotiable emphasis). `plyometric`, `balance`, and `cardio` get
smaller, deliberate counts (CLAUDE.md flags plyometrics explicitly;
balance has exactly one v1 precedent — single-leg balance, eyes closed —
and a few more single-leg/stability variants; cardio gets pickleball/
running-adjacent conditioning movements, not an attempt to catalog all of
cardio).

### 2. "Every movement_pattern x exercise_type combination" is interpreted as "every combination with a real, named exercise," not a literal 35-cell grid

7 `movement_pattern` values x 5 `exercise_type` values = 35 mathematical
combinations. Several are not real things people do — there is no
sensible "balance x cardio" or "core x cardio" named exercise distinct
from a `core` `strength`/`mobility_stretch` movement. This phase covers
every combination that has at least one real, commonly-programmed
exercise, and explicitly does not invent a forced filler row to check a
box. The validation script (see Goals) asserts coverage on the
*populated* combinations' minimums, not on all 35 cells — manufacturing a
nonsensical row to satisfy a grid would be worse than an honest gap.

### 3. Demo video sourcing: real, working YouTube URLs from established fitness-education channels where findable via web search; `null` where not, never a placeholder

`demo_video_url` is sourced by web search per exercise, preferring
well-known evidence-based fitness-education channels (e.g.
Jeff Nippard, ATHLEAN-X, Squat University, GMB Fitness, Bob and Brad,
Tom Merrick/Calisthenicmovement — chosen for topical fit per exercise, not
a fixed single source) over random/unverified uploads. Common, well-
documented strength exercises (squat variants, bench press variants,
rows) are expected to have a findable video for nearly all rows. Highly
specific or less common exercises (e.g. some unilateral mobility
variants) may legitimately have no good match — those rows get
`demo_video_url = null`, never a guessed/fabricated URL and never a
generic "search YouTube for X" non-link. A `null` rate is reported in the
draft CSV's accompanying commit message rather than hidden. This is
explicitly an *offline AI-assisted research pass using web search*, as
the phase brief specifies — not a guess.

**Post-hoc correction (commit `2cade39`):** the first draft (commit
`5dbbce3`) did not actually satisfy this decision — independent
verification via YouTube's oEmbed existence-check endpoint found ~59% of
the 122 claimed "sourced" URLs were hallucinated dead links, not real
search results. A dedicated fix pass re-verified every URL via oEmbed,
replaced every broken/wrong one with a freshly searched-and-oEmbed-verified
real video, and regenerated the migration from the corrected CSV. A
second independent random-sample re-check (15/15) confirmed the fix.
Lesson for any future re-run of this phase: web search alone is not
sufficient evidence a URL is real — verify the exact returned URL against
oEmbed (or an equivalent existence check) before writing it to the CSV,
every time, not just when something looks suspicious.

### 4. Corrective coverage: 4 body parts named in CLAUDE.md's non-negotiables (neck, ankles, hips, shoulders), each with hamstrings folded in as its own fifth tracked area since the spec's task brief calls it out by name

The task brief says "neck, ankle, hips/hamstrings, shoulders" (4 areas,
hips/hamstrings combined) but also separately says "per pain-relevant body
part (neck, ankle, hips/hamstrings, shoulders)" while the schema's
`body_part_taxonomy` has `hips` and `hamstrings` as two separate ids (a v2
schema-design choice already made and not reopened here — see schema-v2
spec Decision linking `pains` body_part values to this taxonomy). This
phase tracks corrective coverage against 5 separate `body_part_taxonomy`
ids — `neck`, `ankles`, `hips`, `hamstrings`, `shoulders` — each
independently hitting the 3-5 minimum, since that is what the live schema
and validation script can actually check (a combined "hips/hamstrings"
bucket has no representation in `body_part_taxonomy`, which is the
source of truth the validation script queries against). This is a strictly
stronger bar than reading the brief as one combined bucket.

### 5. `target_goals` / `body_parts` tag values: constrained to the live `goal_taxonomy`/`body_part_taxonomy` id sets, validated by the validation script, not by a DB constraint

The 6 live `goal_taxonomy` ids (`aesthetic_physique`, `mobility_flexibility`,
`total_body_resilience`, `strength_power`, `endurance`,
`longevity_recovery`) and 12 live `body_part_taxonomy` ids (`neck`,
`thoracic_spine`, `shoulders`, `elbows`, `wrists`, `lower_back`, `hips`,
`hamstrings`, `knees`, `ankles`, `feet`, `other`) are the only legal tag
values. `other` is never used as a tag on an exercise row (it exists in
the taxonomy for user-reported pains with free text, not for exercise
tagging — an exercise's body part is always a known anatomical region).
Multi-tag rows are expected and normal (e.g. a Bulgarian split squat
tags both `hips` and `knees`; "ATG split squat" tags `ankles`, `hips`,
`knees`).

### 6. `default_rep_range` convention: free text, following the existing column's intent (schema-v2 Decision 10, not reopened) — this phase fixes a concrete display convention

Strength rows use `"N-M"` (e.g. `"8-12"`, `"3-5"`). Plyometric rows use
`"N-M reps"` or `"N-M sec"` depending on whether the movement is rep-
counted or time-boxed. Mobility/stretch rows use `"N-Ms hold"` (e.g.
`"60-120s hold"`, matching CLAUDE.md's own Thursday-mobility-block
language) or `"N-M reps/side"` for repeated-motion mobility work (e.g.
CARs). Balance rows use `"N-Ms"` per side or total. Cardio rows use
`"N-M min"`. This is applied consistently across all ~150 rows so the
column is genuinely useful to Phase 2's prompt-building, not a grab-bag
of inconsistent formats.

### 7. Equipment-variant granularity: applied to every major barbell/dumbbell/machine/Smith/cable/bodyweight strength movement family that realistically has 2+ common variants, not to every single exercise

The task brief's example (incline press: dumbbell/barbell/Smith machine)
is the pattern. This phase applies it to every strength movement family
where 2+ equipment variants are both commonly programmed and meaningfully
different in `equipment_needed` (e.g. squat: barbell back squat, goblet
squat, Smith machine squat; row: barbell row, dumbbell row, cable row;
press: several angles x several equipment types). It is **not** applied
to single-equipment or bodyweight-only movements that have no real
equipment variant (Nordic hamstring curl, chin tucks, Copenhagen plank,
deep squat hold) — those stay one row each, as they already are in the v1
seed. This produces meaningfully more rows for the compound-lift families
(consistent with CLAUDE.md's "compound-based" emphasis) without
artificially multiplying mobility/corrective work that has no equipment
axis to vary.

### 8. The 17 v1 rows' backfill values are chosen to be consistent with the rest of the catalog's tagging conventions, with `evidence_rationale` drawing on CLAUDE.md's own stated rationale where CLAUDE.md already gives one

E.g. Nordic hamstring curl's `evidence_rationale` cites CLAUDE.md's exact
framing ("strongest evidence base for hamstring injury prevention");
ATG split squat's cites "ankle resilience." Where CLAUDE.md gives no
specific rationale (e.g. "Chin tucks"), a standard, defensible
evidence-based rationale is written fresh, consistent in tone/length with
the rest of the catalog's `evidence_rationale` values. None of the 17
rows' `name`, `movement_pattern`, `demo_video_url`, or `is_complex` values
are changed — only the 9 new columns are populated.

### 9. Migration granularity: one new migration file, not split across multiple

Unlike Phase 0's one-file-per-table convention, this phase is a single
logical unit of work (one seed pass) operating on one table
(`exercises`), via two kinds of statement (`insert` for ~133-150 new rows,
`update` for 17 backfills) — splitting it across multiple files would add
no rollback/review granularity benefit (rolling back "half a seed" is not
a meaningful unit of recovery) and would make the row-count-reconciliation
verification step harder to reason about as one coherent before/after
diff. One file:
`supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql`.

### 10. Validation script location, runtime, and exact assertions

`engine/tests/test_exercise_catalog.py`, runnable both via `pytest
engine/tests/test_exercise_catalog.py` and standalone
(`python engine/tests/test_exercise_catalog.py`) for the same reason
`engine/run_daily.py` is both importable and directly runnable — this
script is the acceptance gate for an autonomous phase with no human
reviewer, so it must be trivially re-runnable by any later agent (a
Tester dispatch in this same pipeline, or Sohan himself later) without
needing to remember pytest invocation details. It queries the **live**
post-migration Supabase table via `engine/supabase_client.py` (the
existing raw-urllib REST client, already used by `sessions_repo.py`/
`recovery_repo.py` — no new dependency), not a local fixture, because the
whole point of this gate is confirming the actual production catalog
meets the bar, mirroring how Phase 0's plan verified every migration
against the live project rather than a local approximation. It asserts:
(a) total row count is between 100 and 200; (b) every
`goal_taxonomy` id has at least N exercises tagging it in `target_goals`
(N = 5, chosen because a goal with fewer than 5 tagged exercises would
give Phase 2's program-builder too narrow a pool to vary selections
day-to-day — see Decision 11); (c) every `body_part_taxonomy` id except
`other` has at least 1 exercise tagging it in `body_parts` (general
coverage, lower bar than the corrective-specific check); (d) the 5
pain-relevant body parts (`neck`, `ankles`, `hips`, `hamstrings`,
`shoulders`) each have at least 3 `is_corrective = true` exercises tagging
them; (e) every distinct value actually appearing across all rows'
`target_goals`/`body_parts`/`equipment_needed` arrays is a real, known id
(catches typos, since there's no DB-level FK per Non-goals); (f) the
original 17 v1 row names (by exact string match) still exist in the table
and now have non-null `exercise_type`.

### 11. Coverage minimum N = 5 for goals, N = 1 for body parts (general), N = 3 for corrective — chosen deliberately at three different bars, not one uniform number

Goals are broad categories (6 total) every user picks up to 3 of; Phase
2's program-builder needs real day-to-day variety within a goal, so 5 is
the higher bar. Body parts (12, minus `other`) are a finer-grained axis
mainly used for swap-filtering and Trends' muscle-group volume charts
(per the parent spec) — 1 is a "not literally zero coverage" floor, not a
variety bar, since some body parts (e.g. `elbows`, `wrists`) realistically
have few dedicated exercises in a program built around CLAUDE.md's actual
non-negotiables. Corrective coverage at 3 matches the task brief's stated
floor ("at least 3-5... per pain-relevant body part") — 3 is the floor of
that explicit range, chosen as the assertion threshold (the actual seed
content aims for the brief's upper end, 5, per Goals above; the script
asserts the floor so a legitimate, reviewed shortfall of 4 doesn't fail
the gate by an arbitrary stricter-than-specified margin).

### 12. CSV column order and shape: mirrors the `exercises` table's column order exactly, array columns pipe-delimited within the cell

`supabase/seed/exercise-catalog-v2-draft.csv` columns, in order: `name,
movement_pattern, exercise_type, target_goals, body_parts,
evidence_rationale, equipment_needed, default_sets, default_rep_range,
unilateral, is_corrective, demo_video_url, is_complex`. No `id`/
`created_at` columns (DB-generated). Array-typed columns
(`target_goals`, `body_parts`, `equipment_needed`) are written as a
single CSV cell with `|`-delimited values (e.g. `hips|hamstrings`) rather
than a JSON-array string, both because it is more readable in a spot-
check diff and because the migration-generation step (a small, one-off
Python script, not part of the production `engine/` package) splits on
`|` to build the SQL `array[...]` literal — this conversion script is
throwaway tooling for this phase only, not committed as a reusable module
(consistent with Non-goals: no runtime pipeline).

## Out of scope

See Non-goals above. Restated for emphasis: no subjective quality review
(the validation script is a structural gate only, and that gap is
intentional and named, not hidden), no runtime/scheduled research code, no
new DB constraints, no engine/app code changes, no local Supabase
verification. The one explicitly flagged risk this phase accepts and
documents rather than silently resolving: a script that asserts coverage
*counts* cannot catch a wrong-but-plausible exercise/body-part pairing or a
dead demo-video link — that remains a known gap until/unless Sohan does a
manual pass later, which this phase's draft CSV is deliberately kept around
to make easy.
