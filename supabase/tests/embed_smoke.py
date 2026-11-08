# supabase/tests/embed_smoke.py
#
# Runs every PostgREST select string that contains an embed against the live
# REST API and fails on any non-200 (PGRST201 = "more than one relationship",
# the ambiguity that broke build 20). Re-run after each stage's migrations.
#
# Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
# Standard library only. When you add or change an embed in apps/mobile/lib,
# copy the table + select string into EMBEDS below.
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

EMBEDS = [
    (
        "sprint_day_exercises",
        "id, slot_key, tier, exercise_id, prescribed_sets, prescribed_reps_or_duration, exercise_order, completed_at, "
        "exercises!sprint_day_exercises_exercise_id_fkey ( name, evidence_rationale )",
    ),
    (
        "sprint_exercise_pool",
        "exercise_id, prescribed_sets, prescribed_reps_or_duration, "
        "exercises!sprint_exercise_pool_exercise_id_fkey ( name )",
    ),
    (
        "workouts",
        "id, title, notes, source, sprint_day_id, started_at, ended_at, "
        "sprint_days!workouts_sprint_day_id_fkey ( sprints ( pain_point_id ) ), "
        "workout_exercises ( id, exercise_id, position, target_text, measure_rom, sprint_day_exercise_id, "
        "exercises!workout_exercises_exercise_id_fkey ( name, exercise_type, unilateral, evidence_rationale ), "
        "workout_sets ( id, set_number, side, set_type, reps, weight_kg, duration_s, rom_value, rom_unit, completed_at ) )",
    ),
    (
        "workouts",
        "id, title, source, started_at, ended_at, workout_exercises ( id, workout_sets ( id ) )",
    ),
    (
        "workout_exercises",
        "id, workouts!inner ( ended_at ), "
        "workout_sets ( id, set_number, side, set_type, reps, weight_kg, duration_s, rom_value, rom_unit, completed_at )",
    ),
    (
        "sprint_assessments",
        "id, sprint_id, phase, completed_at, sprints!inner ( pain_point_id, cycle_number )",
    ),
    (
        "exercise_logs",
        "date, exercise_id, reps_completed, weight_kg, "
        "exercises!exercise_logs_exercise_id_fkey ( name, body_parts, is_complex )",
    ),
]


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        return 2

    failures = 0
    for table, select in EMBEDS:
        url = f"{base}/rest/v1/{table}?" + urllib.parse.urlencode({"select": select, "limit": "1"})
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status, body = resp.status, ""
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read().decode("utf-8", "replace")
        ok = status == 200
        failures += 0 if ok else 1
        detail = ""
        if not ok:
            try:
                detail = " " + json.loads(body).get("code", "")
            except Exception:
                detail = " " + body[:120]
        print(f"{'PASS' if ok else 'FAIL'} {table} [{status}]{detail}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
