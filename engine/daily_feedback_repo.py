from datetime import timedelta

import supabase_client


def load_recent_feedback(today, lookback_days=3):
    """Loads the last `lookback_days` days of daily_feedback.feedback_text
    (most recent first), feeding program_builder.py's prompt per the v2
    design spec ("last 1-3 days of daily_feedback"). Returns a plain list
    of strings -- the table's other columns (id, owner_id, created_at)
    aren't needed by the prompt."""
    start_date = today - timedelta(days=lookback_days)
    rows = supabase_client.get(
        "daily_feedback",
        {
            "select": "date,feedback_text",
            "date": f"gte.{start_date.isoformat()}",
            "order": "date.desc",
        },
    )
    return [row["feedback_text"] for row in rows]
