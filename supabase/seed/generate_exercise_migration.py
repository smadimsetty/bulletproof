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
