import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import supabase_client

DEFAULT_DAY_LABELS = ["upper", "lower"]


def load_profile(owner_id):
    """Loads the one user_profile row for owner_id, combined with its
    preferred_split's split_taxonomy.day_labels (or DEFAULT_DAY_LABELS if no
    preferred_split is set). Raises ValueError if no profile row exists for
    owner_id -- the engine has exactly one real user today (Sohan) and a
    missing profile row is a configuration error worth failing loudly on,
    matching run_daily.py's existing "fail loudly, not silently" posture."""
    rows = supabase_client.get(
        "user_profile",
        {
            "select": "preferred_split,current_goals,pains,activities,location",
            "owner_id": f"eq.{owner_id}",
        },
    )
    if not rows:
        raise ValueError(f"no user_profile row found for owner_id={owner_id!r}")
    profile = dict(rows[0])

    if profile.get("preferred_split"):
        split_rows = supabase_client.get(
            "split_taxonomy",
            {"select": "day_labels", "id": f"eq.{profile['preferred_split']}"},
        )
        profile["day_labels"] = split_rows[0]["day_labels"] if split_rows else DEFAULT_DAY_LABELS
    else:
        profile["day_labels"] = DEFAULT_DAY_LABELS

    profile.setdefault("pains", [])
    profile.setdefault("current_goals", [])
    profile.setdefault("location", None)
    return profile
