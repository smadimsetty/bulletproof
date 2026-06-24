# Exercise DB seed (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase 1 exercise DB seed described in
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md` and detailed in
`docs/superpowers/specs/2026-06-24-exercise-seed-design.md`: research and
tag 172 new exercises (100-200 range, equipment variants as separate rows),
covering every realistic `movement_pattern` x `exercise_type` combination,
with real demo video URLs sourced via web search wherever findable, and at
least 3 (target 5) `is_corrective = true` exercises per pain-relevant body
part (`neck`, `ankles`, `hips`, `hamstrings`, `shoulders`); backfill the
original 17 v1 rows' v2 columns in the same migration so they are not left
under-tagged; and write a validation script that stands in for Sohan's
unavailable interactive review as this phase's acceptance gate.

**Architecture:** A reviewable draft CSV
(`supabase/seed/exercise-catalog-v2-draft.csv`) is the source of truth for
catalog content. A small throwaway Python script
(`supabase/seed/generate_exercise_migration.py`) converts that CSV into the
`insert into exercises (...)` SQL embedded in one migration file
(`supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql`), which
also contains 17 hand-written `update exercises set ...` statements
backfilling the v1 rows. A validation script
(`engine/tests/test_exercise_catalog.py`) provides pure, unit-testable
checking functions (run via `pytest`, no network) plus a `main()` that
pulls the live post-migration table and runs the same checks — this `main()`
run is the actual acceptance gate.

**Tech Stack:** Postgres 17 (Supabase-managed), `supabase` CLI v2.107.0
(`npx supabase`), linked to project ref `gbtqzdjpkxpgkxjxrjoi`. Python 3
(matches the existing `engine/` package's flat-import, stdlib-only
convention — no new dependencies; `engine/supabase_client.py`'s raw-urllib
REST client is reused as-is).

## Global Constraints

- **Every new/changed row stays nullable-safe and additive.** This phase
  only inserts new `exercises` rows and updates existing rows' already
  -nullable v2 columns (added inert by
  `20260623142500_expand_exercises.sql`) — it never touches
  `movement_pattern`, `demo_video_url`, `is_complex`, or `name` on any of
  the 17 v1 rows, and never drops or alters any column or constraint.
- **The CSV is the reviewable source of truth; the migration's SQL is
  generated from it, never hand-edited independently.** If the CSV ever
  changes, regenerate the migration's INSERT block by running
  `python supabase/seed/generate_exercise_migration.py` from the repo root
  and splicing its output back into the migration file (the migration's own
  header comment states this). Do not hand-edit the `insert into exercises`
  VALUES list directly — that is how the CSV and the migration drift apart.
- **Tag values are constrained to the live taxonomy ids, enforced by the
  validation script, not a DB constraint.** Legal `target_goals` values:
  `aesthetic_physique, mobility_flexibility, total_body_resilience,
  strength_power, endurance, longevity_recovery`. Legal `body_parts` values:
  `neck, thoracic_spine, shoulders, elbows, wrists, lower_back, hips,
  hamstrings, knees, ankles, feet` (`other` is never used as an exercise tag
  — see design spec Decision 5). Legal `movement_pattern` values (existing
  check constraint, unchanged): `squat, hinge, push, pull, core, mobility,
  balance`. Legal `exercise_type` values (existing check constraint,
  unchanged): `strength, mobility_stretch, plyometric, balance, cardio`.
- **No row in this phase's new INSERT may collide (case-insensitively) with
  any of the 17 v1 row names.** The 17 v1 names are: `Chin tucks, Thoracic
  extension on foam roller, Levator scapulae stretch, Banded ankle
  distraction, Wall ankle test (knee-to-wall), Single-leg balance, eyes
  closed, 90/90 hip stretch, PNF hamstring stretch, Couch stretch, Deep
  squat hold, Down dog progression, Sleeper stretch (right), Shoulder CARs,
  Nordic hamstring curl, ATG split squat, Copenhagen plank, Jefferson
  curl`. (A first draft of this catalog accidentally re-researched 16 of
  these under different capitalization as "new" rows; all 16 were caught
  by Task 2's verification step and replaced with genuinely distinct
  exercises — see Task 2's Step 3 for the exact replacements. Any later
  edit to the CSV must re-run that same collision check.)
- **The validation script's three coverage bars are deliberately different
  (see design spec Decision 11), do not unify them:** goals need ≥5 tagged
  exercises each (day-to-day variety within a goal); general body-part
  coverage needs ≥1 (a floor, not a variety bar); corrective coverage per
  pain-relevant body part needs ≥3 (the task brief's explicit floor,
  asserted even though the actual seed content aims for 5).
- **This phase pushes exactly one new migration file
  (`20260624000000_seed_exercise_catalog_v2.sql`) to the linked remote
  project.** No other migration file is created or modified. Push it with
  `npx supabase db push` after sourcing `.env` for
  `SUPABASE_ACCESS_TOKEN`, following the exact pattern Phase 0's plan
  (`docs/superpowers/plans/2026-06-23-schema-v2.md`) used for every one of
  its 12 migrations.
- **No engine/app code changes.** Phase 2 (not yet built) is the first
  consumer of this catalog; this phase only populates the table.
- **Run the full existing `engine/` test suite (`pytest engine/tests/`)
  after adding the new validation script**, not just the new file's own
  tests, to confirm nothing else broke (the test convention's `conftest.py`
  autouse fixture and flat-import `sys.path` setup are shared across all
  test files in that directory).

---

### Task 1: Draft catalog CSV — research and tag 172 new exercises

**Files:**
- Create: `supabase/seed/exercise-catalog-v2-draft.csv`

**Interfaces:**
- Consumes: the live taxonomy ids (`goal_taxonomy`, `body_part_taxonomy`,
  already seeded by Phase 0's
  `20260623141000_create_goal_taxonomy.sql`/`20260623141500_create_body_part_taxonomy.sql`),
  the existing `movement_pattern`/`exercise_type` check constraints
  (`20260622000809_create_exercises.sql`/`20260623142500_expand_exercises.sql`),
  and the 17 v1 row names (`20260622000812_seed_exercises.sql`) as the
  collision list this task's rows must avoid.
- Produces: a 172-row CSV at the path above. Task 2's migration generator
  reads this file directly; Task 3's validation script's coverage checks
  are run against this content (simulated) in this task's own verification
  step, and against the live table (real) in Task 4.

- [x] **Step 1: Write the draft CSV**

This step is already complete in this worktree —
`supabase/seed/exercise-catalog-v2-draft.csv` exists with 172 data rows (173
lines including the header) and the exact column order: `name,
movement_pattern, exercise_type, target_goals, body_parts,
evidence_rationale, equipment_needed, default_sets, default_rep_range,
unilateral, is_corrective, demo_video_url, is_complex`. Array-typed columns
(`target_goals`, `body_parts`, `equipment_needed`) use `|`-delimited values
within a single CSV cell (e.g. `hips|hamstrings`), per design spec Decision
12. The file is written with proper CSV quoting (`csv.QUOTE_MINIMAL`) so
any `evidence_rationale` value containing a literal comma is quoted
correctly — confirm this by checking that re-parsing the file with Python's
standard `csv.DictReader` yields exactly 172 rows with exactly 13 fields
each (Step 2 does this as part of verification).

If this file does not exist when this task runs (e.g. a fresh worktree
that did not inherit this exact session's work), recreate it via this exact
research process: for each of the 7 `movement_pattern` values
(`squat, hinge, push, pull, core, mobility, balance`), enumerate the
realistic `exercise_type` values that have at least one real, commonly
-programmed exercise (not every one of the 35 mathematical combinations —
see design spec Decision 2), and for each cell in that grid, research via
web search 2-6 real exercises with: a real YouTube demo URL from an
established evidence-based fitness-education channel (Jeff Nippard,
ATHLEAN-X, Squat University, GMB Fitness, Bob and Brad, etc.) where
findable, `null` (empty CSV cell) where genuinely not found — never a
fabricated or guessed URL; equipment variants of the same movement
(barbell/dumbbell/Smith machine/cable/bodyweight) as fully separate rows
with distinct names, applied to every major compound-lift family with 2+
real-world equipment variants (design spec Decision 7); a one-sentence
`evidence_rationale` grounded in real exercise science, citing CLAUDE.md's
own stated rationale verbatim where CLAUDE.md already gives one (e.g.
Nordic curl, ATG split squat — though those specific two are v1 rows
backfilled in Task 2, not re-inserted here); `default_rep_range` following
the format convention in design spec Decision 6 (`"N-M"` for strength,
`"N-Ms hold"` for static mobility holds, `"N-M reps/side"` for repeated
unilateral mobility, `"N-M min"` for cardio); and `is_corrective = true`
plus a `body_parts` entry of `neck`, `ankles`, `hips`, `hamstrings`, or
`shoulders` for any exercise that is explicitly rehab/prehab-oriented for
that body part, until each of those 5 body parts has at least 5 such rows.

- [ ] **Step 2: Verify the CSV's structural integrity**

Run (from the repo root):
```bash
python3 -c "
import csv
from collections import Counter

with open('supabase/seed/exercise-catalog-v2-draft.csv', newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

print('Total rows:', len(rows))
assert len(rows) == 172, f'expected 172 rows, got {len(rows)}'

GOAL_IDS = {'aesthetic_physique','mobility_flexibility','total_body_resilience','strength_power','endurance','longevity_recovery'}
BODY_PART_IDS = {'neck','thoracic_spine','shoulders','elbows','wrists','lower_back','hips','hamstrings','knees','ankles','feet','other'}
PATTERNS = {'squat','hinge','push','pull','core','mobility','balance'}
ETYPES = {'strength','mobility_stretch','plyometric','balance','cardio'}

names = [r['name'] for r in rows]
dupes = [n for n,c in Counter(names).items() if c>1]
assert not dupes, f'duplicate names: {dupes}'

v1_names_lower = {
 'chin tucks','thoracic extension on foam roller','levator scapulae stretch','banded ankle distraction',
 'wall ankle test (knee-to-wall)','single-leg balance, eyes closed','90/90 hip stretch','pnf hamstring stretch',
 'couch stretch','deep squat hold','down dog progression','sleeper stretch (right)','shoulder cars',
 'nordic hamstring curl','atg split squat','copenhagen plank','jefferson curl'
}
collisions = [n for n in names if n.lower() in v1_names_lower]
assert not collisions, f'collisions with v1 names (case-insensitive): {collisions}'

for r in rows:
    assert r['movement_pattern'] in PATTERNS, f\"bad movement_pattern on {r['name']}: {r['movement_pattern']}\"
    assert r['exercise_type'] in ETYPES, f\"bad exercise_type on {r['name']}: {r['exercise_type']}\"
    for g in r['target_goals'].split('|'):
        if g: assert g in GOAL_IDS, f\"bad target_goals tag on {r['name']}: {g}\"
    for p in r['body_parts'].split('|'):
        if p: assert p in BODY_PART_IDS, f\"bad body_parts tag on {r['name']}: {p}\"
    assert r['unilateral'] in ('true','false')
    assert r['is_corrective'] in ('true','false')
    assert r['is_complex'] in ('true','false')

print('All structural checks passed.')
"
```
Expected: prints `Total rows: 172` then `All structural checks passed.`
with no `AssertionError`.

- [ ] **Step 3: Verify coverage (simulated post-migration dataset)**

Run (from the repo root) — this simulates the full post-migration table
(17 backfilled v1 rows + the 172 new CSV rows) and runs the same coverage
checks Task 3's validation script will run live, catching any coverage gap
before it reaches the migration file:
```bash
python3 << 'PYEOF'
import sys, os, csv
sys.path.insert(0, os.path.join(os.getcwd(), "engine"))
sys.path.insert(0, os.path.join(os.getcwd(), "engine", "tests"))
import test_exercise_catalog as tec

v1_backfill = {
    "Chin tucks": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["neck"], is_corrective=True),
    "Thoracic extension on foam roller": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["thoracic_spine"], is_corrective=True),
    "Levator scapulae stretch": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["neck"], is_corrective=True),
    "Banded ankle distraction": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["ankles"], is_corrective=True),
    "Wall ankle test (knee-to-wall)": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["ankles"], is_corrective=True),
    "Single-leg balance, eyes closed": dict(exercise_type="balance", target_goals=["total_body_resilience"], body_parts=["ankles"], is_corrective=True),
    "90/90 hip stretch": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility"], body_parts=["hips"], is_corrective=True),
    "PNF hamstring stretch": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["hamstrings"], is_corrective=True),
    "Couch stretch": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility"], body_parts=["hips"], is_corrective=True),
    "Deep squat hold": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["hips","hamstrings","ankles"], is_corrective=True),
    "Down dog progression": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["shoulders","hamstrings","ankles"], is_corrective=True),
    "Sleeper stretch (right)": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["shoulders"], is_corrective=True),
    "Shoulder CARs": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["shoulders"], is_corrective=True),
    "Nordic hamstring curl": dict(exercise_type="strength", target_goals=["total_body_resilience"], body_parts=["hamstrings"], is_corrective=True),
    "ATG split squat": dict(exercise_type="strength", target_goals=["total_body_resilience","mobility_flexibility"], body_parts=["ankles","knees","hips"], is_corrective=False),
    "Copenhagen plank": dict(exercise_type="strength", target_goals=["total_body_resilience"], body_parts=["hips","hamstrings"], is_corrective=True),
    "Jefferson curl": dict(exercise_type="mobility_stretch", target_goals=["mobility_flexibility","total_body_resilience"], body_parts=["lower_back","hamstrings"], is_corrective=True),
}
rows = [{"name": name, **vals} for name, vals in v1_backfill.items()]
with open("supabase/seed/exercise-catalog-v2-draft.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows.append({
            "name": r["name"],
            "exercise_type": r["exercise_type"],
            "target_goals": [g for g in r["target_goals"].split("|") if g],
            "body_parts": [p for p in r["body_parts"].split("|") if p],
            "is_corrective": r["is_corrective"] == "true",
        })

print("Total simulated rows:", len(rows))
results = tec.run_all_checks(rows)
all_ok = True
for name, ok, message in results:
    status = "PASS" if ok else "FAIL"
    if not ok: all_ok = False
    print(f"[{status}] {name}: {message}")
assert all_ok, "one or more coverage checks failed -- fix the CSV before proceeding to Task 2"
print("\nAll simulated checks PASSED.")
PYEOF
```
Expected: `Total simulated rows: 189`, every check shows `[PASS]`, ending
with `All simulated checks PASSED.` (This requires Task 3's
`engine/tests/test_exercise_catalog.py` to already exist for the import to
succeed — if running tasks strictly in order for the first time, do Task 3
before this verification step, or run this check again after Task 3 as a
final cross-check; either order is fine since Tasks 1-3 only read each
other's outputs, never write to them.)

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/exercise-catalog-v2-draft.csv
git commit -m "feat: research and draft 172-row v2 exercise catalog CSV"
```

---

### Task 2: Migration generator script + the real migration file

**Files:**
- Create: `supabase/seed/generate_exercise_migration.py`
- Create: `supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql`

**Interfaces:**
- Consumes: `supabase/seed/exercise-catalog-v2-draft.csv` (Task 1).
- Produces: the migration file that Task 4 pushes to the live project. The
  generator script is throwaway tooling (not imported by `engine/` or any
  other production code) but is committed since it is the reproducible
  link between the CSV and the migration's SQL — required if the CSV is
  ever revised.

- [x] **Step 1: Write the generator script**

This step is already complete in this worktree. The file is
`supabase/seed/generate_exercise_migration.py`:

```python
"""One-off, throwaway conversion script for Phase 1's exercise catalog seed.

Reads supabase/seed/exercise-catalog-v2-draft.csv (the reviewable draft) and
prints the `insert into exercises (...) values ...;` SQL statement covering
every new row in the CSV. This is *not* part of the production engine/app
code and is not imported by anything -- it exists purely to turn the
human/AI-reviewed CSV into the exact SQL embedded in
supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql, without
hand-transcribing 172 rows and risking a transcription error. Run once,
paste its output into the migration file, done.

Usage (from the repo root):
    python supabase/seed/generate_exercise_migration.py
"""
import csv
import os

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exercise-catalog-v2-draft.csv")


def _sql_str(value):
    """Quote a plain text value for SQL, or return NULL for an empty string."""
    if value is None or value == "":
        return "null"
    return "'" + value.replace("'", "''") + "'"


def _sql_array(value):
    """Convert a `|`-delimited CSV cell into a Postgres `array[...]` literal,
    or `array[]::text[]` for an empty cell."""
    if not value:
        return "array[]::text[]"
    items = [item.strip() for item in value.split("|") if item.strip()]
    quoted = ", ".join(_sql_str(item) for item in items)
    return f"array[{quoted}]"


def _sql_bool(value):
    return "true" if value.strip().lower() == "true" else "false"


def _sql_int(value):
    return value.strip() if value.strip() else "null"


def row_to_sql_tuple(row):
    return (
        "  (" +
        ", ".join([
            _sql_str(row["name"]),
            _sql_str(row["movement_pattern"]),
            _sql_str(row["exercise_type"]),
            _sql_array(row["target_goals"]),
            _sql_array(row["body_parts"]),
            _sql_str(row["evidence_rationale"]),
            _sql_array(row["equipment_needed"]),
            _sql_int(row["default_sets"]),
            _sql_str(row["default_rep_range"]),
            _sql_bool(row["unilateral"]),
            _sql_bool(row["is_corrective"]),
            _sql_str(row["demo_video_url"]),
            _sql_bool(row["is_complex"]),
        ]) +
        ")"
    )


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"-- {len(rows)} rows")
    print(
        "insert into exercises (\n"
        "  name, movement_pattern, exercise_type, target_goals, body_parts,\n"
        "  evidence_rationale, equipment_needed, default_sets, default_rep_range,\n"
        "  unilateral, is_corrective, demo_video_url, is_complex\n"
        ") values"
    )
    tuples = [row_to_sql_tuple(r) for r in rows]
    print(",\n".join(tuples) + ";")


if __name__ == "__main__":
    main()
```

If this file does not exist, create it now with the exact content above.

- [x] **Step 2: Generate the INSERT statement and write the full migration**

This step is already complete in this worktree:
`supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql` exists,
containing (in order): a header comment explaining the two-part structure
and the regenerate-from-CSV workflow; 17 `update exercises set ... where
name = '<v1 name>';` statements backfilling each v1 row's 9 v2 columns
(`exercise_type`, `target_goals`, `body_parts`, `evidence_rationale`,
`equipment_needed`, `default_sets`, `default_rep_range`, `unilateral`,
`is_corrective` — `name`, `movement_pattern`, `demo_video_url`,
`is_complex` are never touched); then the single `insert into exercises
(...)  values (...), (...), ...;` statement for the 172 new rows, generated
by running `python supabase/seed/generate_exercise_migration.py` and
splicing its stdout in place of the placeholder.

If this file does not exist, recreate it: run
`python supabase/seed/generate_exercise_migration.py > /tmp/insert.sql`,
then write the migration file with the 17 backfill `update` statements
first (one per v1 row name, values matching the per-row rationale and
tags chosen in Task 1's research — keep `name`, `movement_pattern`,
`demo_video_url`, `is_complex` exactly as
`supabase/migrations/20260622000812_seed_exercises.sql` set them), followed
by the generated INSERT statement's content verbatim (drop its `-- N rows`
first line, keep everything from `insert into exercises (` through the
final `;`).

- [ ] **Step 3: Verify the migration file's structural integrity**

Run (from the repo root):
```bash
python3 << 'PYEOF'
import re

content = open("supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql", encoding="utf-8").read()
lines = content.splitlines()

# Quote balance, excluding -- comments (English possessive apostrophes in
# comments are not SQL string delimiters).
non_comment = "\n".join(l for l in lines if not l.strip().startswith("--"))
assert non_comment.count("'") % 2 == 0, "unbalanced single quotes in non-comment SQL"

assert content.count("(") == content.count(")"), "unbalanced parentheses"
assert content.count("insert into exercises") == 1, "expected exactly 1 insert statement"
assert content.count("update exercises set") == 17, "expected exactly 17 update statements"
assert content.rstrip().endswith(");"), "migration does not end with a terminated statement"

values_section = content.split("insert into exercises (")[1]
row_tuples = re.findall(r"^\s*\('", values_section, re.MULTILINE)
assert len(row_tuples) == 172, f"expected 172 row tuples in the INSERT, found {len(row_tuples)}"

# Confirm every one of the 17 v1 names appears in an `update ... where name =` clause.
v1_names = [
    "Chin tucks", "Thoracic extension on foam roller", "Levator scapulae stretch",
    "Banded ankle distraction", "Wall ankle test (knee-to-wall)",
    "Single-leg balance, eyes closed", "90/90 hip stretch", "PNF hamstring stretch",
    "Couch stretch", "Deep squat hold", "Down dog progression",
    "Sleeper stretch (right)", "Shoulder CARs", "Nordic hamstring curl",
    "ATG split squat", "Copenhagen plank", "Jefferson curl",
]
for name in v1_names:
    assert f"where name = '{name}'" in content, f"missing backfill UPDATE for v1 row: {name}"

print("All migration structural checks passed.")
PYEOF
```
Expected: prints `All migration structural checks passed.` with no
`AssertionError`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed/generate_exercise_migration.py supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql
git commit -m "feat: generate v2 exercise catalog seed migration from the draft CSV"
```

---

### Task 3: Validation script (acceptance gate)

**Files:**
- Create: `engine/tests/test_exercise_catalog.py`

**Interfaces:**
- Consumes: `engine/env_loader.py` and `engine/supabase_client.py`
  (existing, unchanged — the same raw-urllib REST client
  `recovery_repo.py`/`sessions_repo.py` already use) for its live-data
  `main()` path only; the pytest tests below consume nothing external (pure
  functions over in-memory fixtures).
- Produces: `run_all_checks(rows)`, a list of `(check_name, ok, message)`
  tuples used by both the pytest suite (Task 3 itself) and Task 1 Step 3's
  simulated-coverage verification. `main()` is the live acceptance gate
  Task 4 runs after pushing the migration.

- [x] **Step 1 (TDD): write the failing tests first**

This step (and Step 2, implementation) are already complete in this
worktree as a single file with tests and implementation together,
consistent with this repo's existing test-file convention (each
`engine/tests/test_*.py` file imports the sibling module it tests and
defines its own fixtures inline — there is no separate
fixtures-before-implementation split anywhere else in `engine/tests/`). If
recreating this file from scratch, write the test functions in
`engine/tests/test_exercise_catalog.py` first using a `_minimal_row(...)`
fixture helper, confirm each one fails against not-yet-written
`check_*`/`run_all_checks` functions (`ModuleNotFoundError` or
`AttributeError`), then implement the functions in the same file until
every test passes. The full file (tests + implementation together, as it
already exists in this worktree):

```python
"""Acceptance gate for Phase 1's exercise catalog seed (see
docs/superpowers/specs/2026-06-24-exercise-seed-design.md Decision 10/11).

This phase runs autonomously with no interactive Sohan review available, so
this script's assertions stand in for that review: structural/coverage
completeness only (row count, per-taxonomy-id tag coverage, corrective
coverage per pain-relevant body part, tag-value typo checking, the original
17 v1 rows backfilled), never subjective exercise-selection quality.

Two ways to run:
  1. `pytest engine/tests/test_exercise_catalog.py` -- the functions below
     are unit-testable against an in-memory row list with no network calls
     (the bulk of this file).
  2. `python engine/tests/test_exercise_catalog.py` -- pulls the *live*
     post-migration `exercises` table via `supabase_client.get` and runs the
     same checks against real data, exactly mirroring how Phase 0's plan
     verified every migration against the live project rather than a local
     approximation. This is the actual acceptance gate for this phase.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader

# The live, fixed taxonomy ids this phase's tags must be drawn from (see
# supabase/migrations/20260623141000_create_goal_taxonomy.sql and
# 20260623141500_create_body_part_taxonomy.sql -- not re-queried at runtime
# since these taxonomy tables are static/seeded once and not expected to
# change without a new migration).
GOAL_TAXONOMY_IDS = {
    "aesthetic_physique",
    "mobility_flexibility",
    "total_body_resilience",
    "strength_power",
    "endurance",
    "longevity_recovery",
}
BODY_PART_TAXONOMY_IDS = {
    "neck",
    "thoracic_spine",
    "shoulders",
    "elbows",
    "wrists",
    "lower_back",
    "hips",
    "hamstrings",
    "knees",
    "ankles",
    "feet",
    "other",
}
# "other" is a user-pains capture bucket, never a real exercise tag -- see
# design spec Decision 5. Excluded from the per-body-part coverage check.
TAGGABLE_BODY_PART_IDS = BODY_PART_TAXONOMY_IDS - {"other"}

# Per design spec Decision 4: the 5 pain-relevant body parts tracked
# independently for corrective coverage (hips and hamstrings tracked
# separately since that's what body_part_taxonomy and the live schema can
# actually check, even though CLAUDE.md's prose combines them).
PAIN_RELEVANT_BODY_PARTS = ["neck", "ankles", "hips", "hamstrings", "shoulders"]

# Per design spec Decision 11: three different bars for three different
# purposes -- goals need day-to-day variety (higher bar), general body-part
# coverage just needs to not be literally zero, corrective coverage matches
# the task brief's explicit floor.
MIN_ROWS = 100
MAX_ROWS = 200
MIN_EXERCISES_PER_GOAL = 5
MIN_EXERCISES_PER_BODY_PART = 1
MIN_CORRECTIVE_PER_PAIN_BODY_PART = 3

# The 17 v1 seed rows (supabase/migrations/20260622000812_seed_exercises.sql)
# that must survive this phase's migration backfilled, not replaced.
ORIGINAL_V1_EXERCISE_NAMES = [
    "Chin tucks",
    "Thoracic extension on foam roller",
    "Levator scapulae stretch",
    "Banded ankle distraction",
    "Wall ankle test (knee-to-wall)",
    "Single-leg balance, eyes closed",
    "90/90 hip stretch",
    "PNF hamstring stretch",
    "Couch stretch",
    "Deep squat hold",
    "Down dog progression",
    "Sleeper stretch (right)",
    "Shoulder CARs",
    "Nordic hamstring curl",
    "ATG split squat",
    "Copenhagen plank",
    "Jefferson curl",
]


def check_row_count(rows):
    """Returns (ok, message) -- total row count must fall within the spec's
    100-200 target range."""
    count = len(rows)
    ok = MIN_ROWS <= count <= MAX_ROWS
    return ok, f"total row count = {count} (expected {MIN_ROWS}-{MAX_ROWS})"


def check_no_duplicate_names(rows):
    """Returns (ok, message) -- every exercise name must be unique (the
    migration's backfill matches v1 rows by exact name; a duplicate would
    make that match ambiguous)."""
    names = [r["name"] for r in rows]
    dupes = sorted({n for n, c in Counter(names).items() if c > 1})
    return not dupes, f"duplicate names: {dupes}" if dupes else "no duplicate names"


def check_goal_coverage(rows):
    """Returns (ok, message, per_goal_counts) -- every goal_taxonomy id must
    have at least MIN_EXERCISES_PER_GOAL exercises tagging it in
    target_goals, so Phase 2's program-builder has real day-to-day variety
    within each goal."""
    counts = Counter()
    for row in rows:
        for goal in row.get("target_goals") or []:
            counts[goal] += 1
    failing = {
        goal: counts.get(goal, 0)
        for goal in sorted(GOAL_TAXONOMY_IDS)
        if counts.get(goal, 0) < MIN_EXERCISES_PER_GOAL
    }
    ok = not failing
    message = (
        "all goals meet the minimum"
        if ok
        else f"goals below minimum {MIN_EXERCISES_PER_GOAL}: {failing}"
    )
    return ok, message, dict(counts)


def check_body_part_coverage(rows):
    """Returns (ok, message, per_body_part_counts) -- every taggable
    body_part_taxonomy id (excluding 'other') must have at least
    MIN_EXERCISES_PER_BODY_PART exercise tagging it in body_parts."""
    counts = Counter()
    for row in rows:
        for part in row.get("body_parts") or []:
            counts[part] += 1
    failing = {
        part: counts.get(part, 0)
        for part in sorted(TAGGABLE_BODY_PART_IDS)
        if counts.get(part, 0) < MIN_EXERCISES_PER_BODY_PART
    }
    ok = not failing
    message = (
        "all body parts meet the minimum"
        if ok
        else f"body parts below minimum {MIN_EXERCISES_PER_BODY_PART}: {failing}"
    )
    return ok, message, dict(counts)


def check_corrective_coverage(rows):
    """Returns (ok, message, per_pain_part_counts) -- each of the 5
    pain-relevant body parts must have at least MIN_CORRECTIVE_PER_PAIN_BODY_PART
    exercises with is_corrective = true tagging it."""
    counts = Counter()
    for row in rows:
        if not row.get("is_corrective"):
            continue
        for part in row.get("body_parts") or []:
            if part in PAIN_RELEVANT_BODY_PARTS:
                counts[part] += 1
    failing = {
        part: counts.get(part, 0)
        for part in PAIN_RELEVANT_BODY_PARTS
        if counts.get(part, 0) < MIN_CORRECTIVE_PER_PAIN_BODY_PART
    }
    ok = not failing
    message = (
        "all pain-relevant body parts meet the corrective minimum"
        if ok
        else f"pain-relevant body parts below corrective minimum {MIN_CORRECTIVE_PER_PAIN_BODY_PART}: {failing}"
    )
    return ok, message, dict(counts)


def check_no_unknown_tags(rows):
    """Returns (ok, message) -- every value actually used across all rows'
    target_goals/body_parts must be a real, known taxonomy id. There is no
    DB-level FK enforcing this (Postgres can't constrain array elements
    against another table -- see schema-v2 design Decision 11), so this
    check is the practical substitute, catching typos."""
    bad_goals = set()
    bad_parts = set()
    for row in rows:
        for goal in row.get("target_goals") or []:
            if goal not in GOAL_TAXONOMY_IDS:
                bad_goals.add(goal)
        for part in row.get("body_parts") or []:
            if part not in BODY_PART_TAXONOMY_IDS:
                bad_parts.add(part)
    ok = not bad_goals and not bad_parts
    message = (
        "no unknown tag values"
        if ok
        else f"unknown target_goals: {sorted(bad_goals)}; unknown body_parts: {sorted(bad_parts)}"
    )
    return ok, message


def check_original_17_backfilled(rows):
    """Returns (ok, message) -- every original v1 exercise name must still
    exist in the table, with a non-null exercise_type (proof the backfill
    ran, not just that the row survived untouched)."""
    by_name = {r["name"]: r for r in rows}
    missing = [name for name in ORIGINAL_V1_EXERCISE_NAMES if name not in by_name]
    under_tagged = [
        name
        for name in ORIGINAL_V1_EXERCISE_NAMES
        if name in by_name and not by_name[name].get("exercise_type")
    ]
    ok = not missing and not under_tagged
    parts = []
    if missing:
        parts.append(f"missing original rows: {missing}")
    if under_tagged:
        parts.append(f"original rows still untagged (null exercise_type): {under_tagged}")
    message = "; ".join(parts) if parts else "all 17 original rows present and backfilled"
    return ok, message


def run_all_checks(rows):
    """Runs every check against `rows` and returns a list of
    (check_name, ok, message) tuples, in a stable order."""
    results = []

    ok, message = check_row_count(rows)
    results.append(("row_count", ok, message))

    ok, message = check_no_duplicate_names(rows)
    results.append(("no_duplicate_names", ok, message))

    ok, message, _ = check_goal_coverage(rows)
    results.append(("goal_coverage", ok, message))

    ok, message, _ = check_body_part_coverage(rows)
    results.append(("body_part_coverage", ok, message))

    ok, message, _ = check_corrective_coverage(rows)
    results.append(("corrective_coverage", ok, message))

    ok, message = check_no_unknown_tags(rows)
    results.append(("no_unknown_tags", ok, message))

    ok, message = check_original_17_backfilled(rows)
    results.append(("original_17_backfilled", ok, message))

    return results


def fetch_live_exercises():
    """Pulls every row of the live `exercises` table via the existing
    raw-urllib REST client (engine/supabase_client.py), the same client
    sessions_repo.py/recovery_repo.py already use. Requires SUPABASE_URL and
    SUPABASE_SERVICE_ROLE_KEY in the environment -- env_loader.load_env()
    is called first to populate them from the repo-root .env (resolving the
    main checkout's .env even when running inside a worktree, exactly as
    run_daily.py does)."""
    import supabase_client

    return supabase_client.get(
        "exercises",
        {
            "select": "name,movement_pattern,exercise_type,target_goals,body_parts,"
            "is_corrective,demo_video_url"
        },
    )


# ---------------------------------------------------------------------
# pytest tests -- pure functions against fixed in-memory fixtures, no
# network calls. These exercise the checking logic itself; the live-data
# acceptance gate is `main()` below.
# ---------------------------------------------------------------------


def _minimal_row(
    name,
    target_goals=None,
    body_parts=None,
    is_corrective=False,
    exercise_type="strength",
):
    return {
        "name": name,
        "exercise_type": exercise_type,
        "target_goals": target_goals or [],
        "body_parts": body_parts or [],
        "is_corrective": is_corrective,
    }


def test_check_row_count_passes_within_range():
    rows = [_minimal_row(f"Exercise {i}") for i in range(150)]
    ok, message = check_row_count(rows)
    assert ok
    assert "150" in message


def test_check_row_count_fails_below_minimum():
    rows = [_minimal_row(f"Exercise {i}") for i in range(50)]
    ok, message = check_row_count(rows)
    assert not ok
    assert "50" in message


def test_check_row_count_fails_above_maximum():
    rows = [_minimal_row(f"Exercise {i}") for i in range(250)]
    ok, message = check_row_count(rows)
    assert not ok


def test_check_no_duplicate_names_passes_when_all_unique():
    rows = [_minimal_row("A"), _minimal_row("B")]
    ok, message = check_no_duplicate_names(rows)
    assert ok


def test_check_no_duplicate_names_fails_on_duplicate():
    rows = [_minimal_row("A"), _minimal_row("A")]
    ok, message = check_no_duplicate_names(rows)
    assert not ok
    assert "A" in message


def test_check_goal_coverage_fails_when_a_goal_has_too_few_rows():
    # endurance only tagged on 1 row, well below the minimum of 5.
    rows = [
        _minimal_row("A", target_goals=["endurance"]),
    ] + [_minimal_row(f"Filler {i}", target_goals=["strength_power"]) for i in range(10)]
    ok, message, counts = check_goal_coverage(rows)
    assert not ok
    assert "endurance" in message
    assert counts["endurance"] == 1


def test_check_goal_coverage_passes_when_every_goal_meets_minimum():
    rows = []
    for goal in GOAL_TAXONOMY_IDS:
        rows += [_minimal_row(f"{goal} {i}", target_goals=[goal]) for i in range(5)]
    ok, message, counts = check_goal_coverage(rows)
    assert ok
    for goal in GOAL_TAXONOMY_IDS:
        assert counts[goal] == 5


def test_check_body_part_coverage_fails_on_zero_coverage():
    # No row tags "wrists" at all.
    rows = [_minimal_row("A", body_parts=["hips"])]
    ok, message, counts = check_body_part_coverage(rows)
    assert not ok
    assert "wrists" in message


def test_check_corrective_coverage_only_counts_is_corrective_rows():
    # 5 rows tag "neck" but none are corrective -- should still fail.
    rows = [_minimal_row(f"Neck {i}", body_parts=["neck"], is_corrective=False) for i in range(5)]
    ok, message, counts = check_corrective_coverage(rows)
    assert not ok
    assert counts.get("neck", 0) == 0


def test_check_corrective_coverage_passes_at_minimum_threshold():
    rows = []
    for part in PAIN_RELEVANT_BODY_PARTS:
        rows += [
            _minimal_row(f"{part} corrective {i}", body_parts=[part], is_corrective=True)
            for i in range(MIN_CORRECTIVE_PER_PAIN_BODY_PART)
        ]
    ok, message, counts = check_corrective_coverage(rows)
    assert ok
    for part in PAIN_RELEVANT_BODY_PARTS:
        assert counts[part] == MIN_CORRECTIVE_PER_PAIN_BODY_PART


def test_check_no_unknown_tags_catches_a_typo():
    rows = [_minimal_row("A", target_goals=["strength_pwoer"])]  # typo
    ok, message = check_no_unknown_tags(rows)
    assert not ok
    assert "strength_pwoer" in message


def test_check_no_unknown_tags_passes_for_known_values():
    rows = [_minimal_row("A", target_goals=["strength_power"], body_parts=["hips"])]
    ok, message = check_no_unknown_tags(rows)
    assert ok


def test_check_original_17_backfilled_fails_when_a_row_is_missing():
    rows = [_minimal_row(name) for name in ORIGINAL_V1_EXERCISE_NAMES[:-1]]
    ok, message = check_original_17_backfilled(rows)
    assert not ok
    assert ORIGINAL_V1_EXERCISE_NAMES[-1] in message


def test_check_original_17_backfilled_fails_when_exercise_type_still_null():
    rows = [_minimal_row(name) for name in ORIGINAL_V1_EXERCISE_NAMES]
    rows[0]["exercise_type"] = None
    ok, message = check_original_17_backfilled(rows)
    assert not ok
    assert ORIGINAL_V1_EXERCISE_NAMES[0] in message


def test_check_original_17_backfilled_passes_when_all_present_and_tagged():
    rows = [_minimal_row(name) for name in ORIGINAL_V1_EXERCISE_NAMES]
    ok, message = check_original_17_backfilled(rows)
    assert ok


def test_run_all_checks_returns_one_result_per_check():
    rows = [_minimal_row(name) for name in ORIGINAL_V1_EXERCISE_NAMES]
    results = run_all_checks(rows)
    names = [name for name, _ok, _message in results]
    assert names == [
        "row_count",
        "no_duplicate_names",
        "goal_coverage",
        "body_part_coverage",
        "corrective_coverage",
        "no_unknown_tags",
        "original_17_backfilled",
    ]


# ---------------------------------------------------------------------
# Standalone entry point -- the actual acceptance gate, run against live
# data. `python engine/tests/test_exercise_catalog.py` from the repo root
# (or from inside this worktree -- env_loader resolves the main checkout's
# .env either way).
# ---------------------------------------------------------------------


def main():
    env_loader.load_env()
    rows = fetch_live_exercises()
    results = run_all_checks(rows)

    print(f"Fetched {len(rows)} live exercise rows.\n")
    all_ok = True
    for name, ok, message in results:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_ok = False
        print(f"[{status}] {name}: {message}")

    if all_ok:
        print("\nAll checks passed -- acceptance gate satisfied.")
        return 0
    print("\nOne or more checks failed -- acceptance gate NOT satisfied.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the test suite and confirm all tests pass**

Run (from the repo root):
```bash
python -m pytest engine/tests/test_exercise_catalog.py -v
```
Expected: 16 tests collected, all pass (`16 passed`).

- [ ] **Step 3: Run the full existing engine test suite to confirm nothing broke**

Run:
```bash
python -m pytest engine/tests/ -q
```
Expected: every existing test still passes, total count includes the 16
new tests plus all pre-existing ones (`48 passed` if no other phase has
landed tests in the meantime; the exact total may differ if other phases
are running concurrently, but the run must show `0 failed`).

- [ ] **Step 4: Commit**

```bash
git add engine/tests/test_exercise_catalog.py
git commit -m "test: add acceptance-gate validation script for the v2 exercise catalog"
```

---

### Task 4: Push the migration and run the live acceptance gate

**Files:**
- No new files. This task pushes Task 2's migration to the linked remote
  Supabase project and runs Task 3's validation script against the live
  result.

**Interfaces:**
- Consumes: `supabase/migrations/20260624000000_seed_exercise_catalog_v2.sql`
  (Task 2), `engine/tests/test_exercise_catalog.py`'s `main()` (Task 3),
  and the repo-root `.env` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` — gitignored, already present in this
  worktree per the same setup Phase 0's plan used).
- Produces: the live `exercises` table in production, fully v2-tagged
  (189 rows: 17 backfilled + 172 new). This is the last task in the plan —
  after this task passes, Phase 1 is complete and Phase 2 (the Claude
  program-builder, not yet built) can read a real, tagged catalog.

- [ ] **Step 1: Push the migration to the linked remote project**

Run (from the repo root):
```bash
set -a && source .env && set +a && export SUPABASE_ACCESS_TOKEN
npx supabase db push
```
Expected: prompts to confirm pushing 1 new migration
(`20260624000000_seed_exercise_catalog_v2.sql`); confirm yes; exits 0 with
"Finished supabase db push."

- [ ] **Step 2: Spot-check the live table via the REST API**

Run:
```bash
set -a && source .env && set +a
echo "--- total row count ---"
curl -s "$SUPABASE_URL/rest/v1/exercises?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -I | grep -i content-range
echo "--- one backfilled v1 row, confirm it now has v2 tags ---"
curl -s "$SUPABASE_URL/rest/v1/exercises?select=name,exercise_type,target_goals,body_parts,is_corrective&name=eq.Nordic%20hamstring%20curl" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
echo "--- one new row, confirm it exists with a demo video ---"
curl -s "$SUPABASE_URL/rest/v1/exercises?select=name,demo_video_url&name=eq.Barbell%20Back%20Squat" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: the count check shows `*/189` (17 backfilled + 172 new). "Nordic
hamstring curl" now shows `exercise_type: "strength"`,
`target_goals: ["total_body_resilience"]`, `body_parts: ["hamstrings"]`,
`is_corrective: true` (not the pre-migration `null`/`false`/`[]`
defaults). "Barbell Back Squat" exists with a non-null
`demo_video_url`.

- [ ] **Step 3: Run the validation script's live acceptance gate**

Run:
```bash
set -a && source .env && set +a
python engine/tests/test_exercise_catalog.py
```
Expected: prints `Fetched 189 live exercise rows.` followed by 7 lines each
showing `[PASS] <check_name>: <message>`, ending with `All checks passed --
acceptance gate satisfied.`, and exits with code 0
(`echo $?` immediately after shows `0`).

If any check shows `[FAIL]`, do not proceed — the message names the exact
shortfall (e.g. which goal/body-part is under the minimum, which v1 row is
still untagged). Fix the gap in `supabase/seed/exercise-catalog-v2-draft.csv`,
regenerate the migration's INSERT block (Task 2, Step 2), push a corrective
follow-up migration (a second timestamped file — do not edit
`20260624000000_...` after it has been pushed to the live project; Postgres
migrations are append-only history, matching Phase 0's plan convention of
never editing an already-pushed file), and re-run this step.

- [ ] **Step 4: No commit needed**

This task only runs commands against the already-committed migration file
and validation script — there is no new file to commit. If Step 3
required a corrective follow-up migration, that migration file is a new,
separately committed artifact (`git add` + `git commit` for that file
specifically), not amending this task's existing commits.

---

**End state after this plan:** the live `exercises` table holds 189 rows
(17 v1 rows backfilled with real v2 tags, 172 new researched rows) spanning
every realistic `movement_pattern` x `exercise_type` combination, with
equipment variants as separate rows, real demo video URLs on the large
majority of rows (sourced via web search, `null` where genuinely not
found — never fabricated), and at least 5 `is_corrective = true` rows for
each of `neck`, `ankles`, `hips`, `hamstrings`, `shoulders`. The validation
script at `engine/tests/test_exercise_catalog.py` is the durable acceptance
gate substituting for Sohan's unavailable interactive review — it can be
re-run by anyone at any time (`python engine/tests/test_exercise_catalog.py`)
to re-confirm the catalog still meets the bar, including after any future
manual edit Sohan makes once he does eventually look at the draft CSV. No
engine or app code was touched by any task in this plan; Phase 2 (the
Claude program-builder) is now unblocked to read a real, tagged catalog.
