import argparse
import os
import sys
from datetime import date

# See run_daily.py's identical comment -- this module also uses engine's flat
# top-level import convention (import scoring, import env_loader, etc.),
# which only resolves when engine/'s own directory is on sys.path.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import daily_feedback_repo
import env_loader
import profile_repo
import program_builder
import sessions_repo
import supabase_client
from rationale import build_breakdown
from run_daily import build_block_exercise_rows, build_block_rows, build_recommendation_row

SESSIONS_LOOKBACK_DAYS = 60

# The six real session_type values program_builder/scoring know how to build
# a program for. activity_taxonomy (a separate lookup table backing
# Settings' dropdown-to-add UI elsewhere in the app) has additional entries
# (e.g. "yoga") that are valid *activities* but not valid *session types* --
# forcing one of those through here would either hit a DB check constraint
# on recommendations.top_pick/recommendation_blocks.block_type, or (worse)
# silently confuse program_builder, which only has catalog/prompt handling
# for these six. Fail fast in Python instead.
VALID_ACTIVITIES = {"upper", "lower", "pickleball", "run", "mobility", "rest"}


def _gated_blocks_for(activity):
    """Same pickleball-brackets-with-a-mobility/ankle-warmup-block rule as
    scoring.gate_today, applied to a user-forced activity instead of a
    scored top pick. Kept as a small local helper (not a change to
    scoring.gate_today's own contract) since a swap isn't a scored day."""
    if activity == "pickleball":
        return [activity, "mobility"]
    return [activity]


def _load_previous_recommendation(today):
    """Looks up today's existing recommendation row, if any, to recover the
    prior top_pick (for score_breakdown.swapped_from) and any already-known
    readiness score (from score_breakdown.readiness) -- a swap changes which
    activity today's program is for, not the day's recovery signals, so
    there's no reason to re-pull Oura or re-derive readiness. Returns
    (None, None) when there's no existing row, same as a normal provisional
    (pre-Oura-sync) run."""
    existing = supabase_client.get(
        "recommendations",
        {"select": "id,top_pick,score_breakdown", "date": f"eq.{today.isoformat()}"},
    )
    if not existing:
        return None, None
    row = existing[0]
    readiness = (row.get("score_breakdown") or {}).get("readiness")
    return row.get("top_pick"), readiness


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Force today's recommendation to a specific activity (the mobile app's 'swap activity' feature)."
    )
    parser.add_argument("--date", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    parser.add_argument("--activity", required=True, help="One of: " + ", ".join(sorted(VALID_ACTIVITIES)))
    args = parser.parse_args(argv)

    env_loader.load_env()

    if args.activity not in VALID_ACTIVITIES:
        print(
            f"Error: --activity must be one of {sorted(VALID_ACTIVITIES)}, got {args.activity!r}.",
            file=sys.stderr,
        )
        sys.exit(1)

    today = args.date
    activity = args.activity
    owner_id = os.environ["ENGINE_OWNER_ID"]

    previous_top_pick, readiness = _load_previous_recommendation(today)

    gated_blocks = _gated_blocks_for(activity)
    history = sessions_repo.load_recent_history(today, lookback_days=SESSIONS_LOOKBACK_DAYS)
    profile = profile_repo.load_profile(owner_id)
    recent_feedback = daily_feedback_repo.load_recent_feedback(today)

    top2 = [(activity, 0.0)]
    breakdown = build_breakdown(today, history, readiness, top2)
    breakdown["manual_swap"] = True
    breakdown["swapped_from"] = previous_top_pick

    program = program_builder.build_daily_program(today, gated_blocks, profile, breakdown, recent_feedback, owner_id)

    row = build_recommendation_row(today, top2, breakdown, program)
    inserted = supabase_client.upsert("recommendations", [row], conflict_column="date")
    recommendation_id = inserted[0]["id"] if inserted else None

    if recommendation_id:
        # Delete this recommendation's existing blocks first -- required so
        # a repeated/re-swapped day doesn't accumulate duplicate blocks
        # alongside the new ones. recommendation_block_exercises.block_id
        # has ON DELETE CASCADE back to recommendation_blocks.id, so this
        # single delete also clears the old exercises.
        supabase_client.delete("recommendation_blocks", {"recommendation_id": f"eq.{recommendation_id}"})

        if program["blocks"]:
            block_rows = build_block_rows(recommendation_id, program["blocks"])
            supabase_client.insert("recommendation_blocks", block_rows)
            # Re-read the just-inserted blocks to recover their generated
            # ids, same as run_daily.main() does -- supabase_client.insert()
            # discards the response body.
            inserted_blocks = supabase_client.get(
                "recommendation_blocks",
                {"select": "id,block_order", "recommendation_id": f"eq.{recommendation_id}", "order": "block_order"},
            )
            block_ids = [b["id"] for b in inserted_blocks]
            exercise_rows = build_block_exercise_rows(block_ids, program["blocks"])
            if exercise_rows:
                supabase_client.insert("recommendation_block_exercises", exercise_rows)

    print(f"Swapped {today.isoformat()} to {activity} (was {previous_top_pick}).")


if __name__ == "__main__":
    main()
