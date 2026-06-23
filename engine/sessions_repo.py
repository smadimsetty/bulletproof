from datetime import datetime, timedelta

import supabase_client


def load_recent_history(today, lookback_days=60):
    """Load session history from the last `lookback_days` days (relative to
    `today`) as a dict mapping date -> session type string, matching the
    shape scoring.recommend()'s `history` param expects.

    lookback_days defaults to 60 to match scoring.days_since()'s internal
    60-day search cap -- a shorter window would silently produce wrong
    "overdue" signals for rest/mobility.
    """
    start_date = today - timedelta(days=lookback_days)
    rows = supabase_client.get(
        "sessions",
        {
            "select": "date,type",
            "date": f"gte.{start_date.isoformat()}",
            "order": "date",
        },
    )
    return {
        datetime.strptime(row["date"], "%Y-%m-%d").date(): row["type"]
        for row in rows
    }
