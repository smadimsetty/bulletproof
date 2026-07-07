import os
import sys
from datetime import date

# Every module in this package uses flat top-level imports (import scoring,
# import env_loader, etc.), which only resolve when engine/'s own directory
# is on sys.path -- automatic for `cd engine && python run_daily.py`, but
# not for `python -m engine.run_daily` from the repo root. Appending (not
# inserting at index 0) means any real same-named package already on the
# path still wins -- this is only a fallback for engine's own sibling
# modules, scoped to loading this module specifically rather than a
# permanent side effect of importing the engine package at all.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import daily_feedback_repo
import env_loader
import profile_repo
import program_builder
import recovery_repo
import scoring
import sessions_repo
import supabase_client
from rationale import build_breakdown

SESSIONS_LOOKBACK_DAYS = 60


def build_recommendation_row(today, top2, breakdown, program):
    """Shape one row for the recommendations table from today's scoring
    result and program_builder output. Raises ValueError if no candidates
    survived scoring (should be unreachable -- rest/mobility are never
    gated out -- but fails loudly rather than writing a row with a null
    top_pick, which the table's not-null constraint would reject anyway)."""
    if not top2:
        raise ValueError("no candidates survived scoring -- cannot build a recommendation row")

    top_pick = top2[0][0]
    runner_up = top2[1][0] if len(top2) > 1 else None

    return {
        "date": today.isoformat(),
        "top_pick": top_pick,
        "runner_up": runner_up,
        "score_breakdown": breakdown,
        "internal_rationale": program["internal_rationale"],
        "public_rationale": program["public_rationale"],
        "program_generated_by": program["program_generated_by"],
        "claude_model": program["claude_model"],
        "claude_usage": program["claude_usage"],
        # owner_id defaults to auth.uid() (v2 multi-user RLS migration),
        # which is NULL for this service-role REST call -- must be explicit
        # or the NOT NULL constraint rejects the row.
        "owner_id": os.environ["ENGINE_OWNER_ID"],
    }


def build_block_rows(recommendation_id, blocks):
    """Shapes recommendation_blocks rows from program_builder's block list,
    in the same order Claude (or the fallback) returned them -- block_order
    is purely positional, matching recommendation_blocks.block_order's
    evident purpose (render blocks top-to-bottom in that order)."""
    rows = []
    for order, block in enumerate(blocks):
        rows.append({
            "recommendation_id": recommendation_id,
            "block_order": order,
            "block_type": block["block_type"],
            "split_day_label": block.get("split_day_label"),
            "title": block["title"],
            "estimated_minutes": block.get("estimated_minutes"),
        })
    return rows


def build_block_exercise_rows(block_ids, blocks):
    """Shapes recommendation_block_exercises rows. block_ids must be in the
    same order as blocks (the order build_block_rows iterated them in,
    which is also the order the insert response returns ids in, since
    PostgREST preserves insert-array order in its response array)."""
    rows = []
    for block_id, block in zip(block_ids, blocks):
        for order, exercise in enumerate(block.get("exercises", [])):
            rows.append({
                "block_id": block_id,
                "exercise_id": exercise["exercise_id"],
                "exercise_order": order,
                "prescribed_sets": exercise.get("sets"),
                "prescribed_reps": exercise.get("reps"),
                "prescribed_weight_note": exercise.get("weight_note"),
                "is_unilateral_left_first": bool(exercise.get("unilateral_left_first")),
                "notes": exercise.get("notes"),
            })
    return rows


def recommendation_already_fresh(today):
    """True if today's recommendations row already reflects real (non-null)
    Oura readiness, OR was written by a manual swap (swap_activity.py) --
    either means an earlier run today already did the real work and this
    run should be a no-op. A missing row, or a row whose
    score_breakdown.readiness is still null and wasn't a manual swap (an
    earlier run before Oura had synced), is not considered fresh.

    The manual_swap check matters because readiness is very often null
    (no Anthropic key/Oura sync yet) -- without it, a swap always looks
    "not fresh" to this guard, so a later on-demand trigger (e.g. a
    pull-to-refresh) would silently rerun the full scoring pipeline and
    overwrite the user's manual swap."""
    existing = supabase_client.get(
        "recommendations",
        {"select": "score_breakdown", "date": f"eq.{today.isoformat()}"},
    )
    if not existing:
        return False
    breakdown = existing[0].get("score_breakdown") or {}
    return breakdown.get("readiness") is not None or breakdown.get("manual_swap") is True


def main():
    env_loader.load_env()
    today = date.today()

    if recommendation_already_fresh(today):
        print(f"Recommendation for {today.isoformat()} already generated with real readiness data -- skipping.")
        return

    owner_id = os.environ["ENGINE_OWNER_ID"]
    readiness = recovery_repo.pull_and_upsert_today(today)
    if readiness is None:
        print(f"Warning: no Oura readiness data available yet for {today.isoformat()}.", file=sys.stderr)

    history = sessions_repo.load_recent_history(today, lookback_days=SESSIONS_LOOKBACK_DAYS)
    profile = profile_repo.load_profile(owner_id)
    recent_feedback = daily_feedback_repo.load_recent_feedback(today)

    top2 = scoring.recommend(today, history, readiness, day_labels=profile["day_labels"], location=profile["location"])
    breakdown = build_breakdown(today, history, readiness, top2)
    gated_blocks = scoring.gate_today(
        today, history, readiness, pains=profile["pains"], location=profile["location"],
        day_labels=profile["day_labels"],
    )

    program = program_builder.build_daily_program(today, gated_blocks, profile, breakdown, recent_feedback, owner_id)

    row = build_recommendation_row(today, top2, breakdown, program)
    inserted = supabase_client.upsert("recommendations", [row], conflict_column="date")
    recommendation_id = inserted[0]["id"] if inserted else None

    if recommendation_id and program["blocks"]:
        block_rows = build_block_rows(recommendation_id, program["blocks"])
        supabase_client.insert("recommendation_blocks", block_rows)
        # Re-read the just-inserted blocks to get their generated ids --
        # supabase_client.insert() (unlike upsert()) discards the response
        # body today (see its docstring: "Plain insert, no upsert"), so the
        # ids aren't available from that call's return value yet. Querying
        # by recommendation_id + block_order (both just written, both
        # exact-match filters) is the simplest way to recover them without
        # changing insert()'s existing contract for its other callers.
        inserted_blocks = supabase_client.get(
            "recommendation_blocks",
            {"select": "id,block_order", "recommendation_id": f"eq.{recommendation_id}", "order": "block_order"},
        )
        block_ids = [b["id"] for b in inserted_blocks]
        exercise_rows = build_block_exercise_rows(block_ids, program["blocks"])
        if exercise_rows:
            supabase_client.insert("recommendation_block_exercises", exercise_rows)

    print(
        f"Wrote recommendation for {today.isoformat()}: top_pick={row['top_pick']}, "
        f"runner_up={row['runner_up']}, program_generated_by={row['program_generated_by']}"
    )


if __name__ == "__main__":
    main()
