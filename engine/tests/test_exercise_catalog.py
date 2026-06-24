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
