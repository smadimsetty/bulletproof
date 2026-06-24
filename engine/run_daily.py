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

import env_loader
import recovery_repo
import sessions_repo
import supabase_client
from rationale import build_breakdown, build_internal_rationale, build_public_rationale
from scoring import recommend

SESSIONS_LOOKBACK_DAYS = 60


def build_recommendation_row(today, top2, breakdown, internal_rationale, public_rationale):
    """Shape one row for the recommendations table from today's scoring
    result. Raises ValueError if no candidates survived scoring (should be
    unreachable in practice -- rest/mobility are never gated out -- but
    fails loudly rather than writing a row with a null top_pick, which the
    table's `not null` constraint would reject anyway)."""
    if not top2:
        raise ValueError("no candidates survived scoring -- cannot build a recommendation row")

    top_pick = top2[0][0]
    runner_up = top2[1][0] if len(top2) > 1 else None

    return {
        "date": today.isoformat(),
        "top_pick": top_pick,
        "runner_up": runner_up,
        "score_breakdown": breakdown,
        "internal_rationale": internal_rationale,
        "public_rationale": public_rationale,
        # owner_id defaults to auth.uid() (v2 multi-user RLS migration),
        # which is NULL for this service-role REST call -- must be explicit
        # or the NOT NULL constraint rejects the row.
        "owner_id": os.environ["ENGINE_OWNER_ID"],
    }


def main():
    env_loader.load_env()
    today = date.today()

    readiness = recovery_repo.pull_and_upsert_today(today)
    if readiness is None:
        print(f"Warning: no Oura readiness data available yet for {today.isoformat()}.", file=sys.stderr)

    history = sessions_repo.load_recent_history(today, lookback_days=SESSIONS_LOOKBACK_DAYS)

    top2 = recommend(today, history, readiness)
    breakdown = build_breakdown(today, history, readiness, top2)
    internal_rationale = build_internal_rationale(breakdown)
    public_rationale = build_public_rationale(breakdown)

    row = build_recommendation_row(today, top2, breakdown, internal_rationale, public_rationale)
    supabase_client.upsert("recommendations", [row], conflict_column="date")

    print(f"Wrote recommendation for {today.isoformat()}: top_pick={row['top_pick']}, runner_up={row['runner_up']}")


if __name__ == "__main__":
    main()
