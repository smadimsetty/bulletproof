# %% [markdown]
# # Weight-Tuning Prototype
#
# Loads real recovery and session history from Supabase and runs the
# deterministic scoring engine from `scoring.py` against each day, so the
# WEIGHTS constants in that module can be tuned by eyeballing whether the
# recommendation matches what actually happened / felt right.

# %%
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath("__file__")))
from env_loader import load_env
import supabase_client
from scoring import recommend

load_env()

# %%
recovery_rows = supabase_client.get(
    "recovery", {"select": "date,subjective_readiness", "order": "date"}
)
session_rows = supabase_client.get("sessions", {"select": "date,type", "order": "date"})

readiness_by_day = {
    datetime.strptime(r["date"], "%Y-%m-%d").date(): r["subjective_readiness"]
    for r in recovery_rows
}
history = {
    datetime.strptime(r["date"], "%Y-%m-%d").date(): r["type"] for r in session_rows
}

print(f"Loaded {len(readiness_by_day)} recovery rows and {len(history)} session rows.")

# %%
import pandas as pd

comparison_rows = []
for day in sorted(history.keys()):
    readiness = readiness_by_day.get(day)
    top2 = recommend(day, history, readiness)
    comparison_rows.append(
        {
            "date": day,
            "actual": history[day],
            "readiness": readiness,
            "top_pick": top2[0][0] if top2 else None,
            "top_score": round(top2[0][1], 2) if top2 else None,
            "runner_up": top2[1][0] if len(top2) > 1 else None,
            "match": (top2[0][0] == history[day]) if top2 else False,
        }
    )

comparison = pd.DataFrame(comparison_rows)
comparison

# %%
print(f"Top-pick matched actual session on {comparison['match'].mean():.0%} of days")
comparison[~comparison["match"]]

# %% [markdown]
# ## Next: tune from here
#
# Adjust the constants in `scoring.py`'s `WEIGHTS` dict and re-run the cells
# above. Also still missing from `CLAUDE.md`'s full rule set, to add here once
# the basics feel right: the run 10%/week progression cap, and balancing
# against the ~10-day target session ratios (~4 lift / 2 pickleball / 1-2 run
# / 1 rest).
