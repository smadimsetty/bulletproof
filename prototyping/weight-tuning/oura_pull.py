import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env_loader import load_env
from oura_client import fetch
import supabase_client

load_env()

START_DATE = "2024-08-21"
END_DATE = "2026-06-21"


def to_recovery_row(readiness_rec, sleep_by_day):
    day = readiness_rec["day"]
    sleep_rec = sleep_by_day.get(day)
    score = readiness_rec["score"]
    subjective_readiness = max(1, min(10, round(score / 10)))
    row = {
        "date": day,
        "source": "oura",
        "subjective_readiness": subjective_readiness,
    }
    if sleep_rec:
        row["sleep_hrs"] = round(sleep_rec["total_sleep_duration"] / 3600, 2)
        row["hrv"] = sleep_rec["average_hrv"]
        row["resting_hr"] = sleep_rec["lowest_heart_rate"]
    else:
        row["sleep_hrs"] = None
        row["hrv"] = None
        row["resting_hr"] = None
    return row


def to_activity_row(activity_rec, workouts_by_day):
    day = activity_rec["day"]
    day_workouts = workouts_by_day.get(day, [])
    return {
        "date": day,
        "activity_score": activity_rec["score"],
        "total_calories": activity_rec["total_calories"],
        "active_calories": activity_rec["active_calories"],
        "steps": activity_rec["steps"],
        "high_activity_time": activity_rec["high_activity_time"],
        "medium_activity_time": activity_rec["medium_activity_time"],
        "low_activity_time": activity_rec["low_activity_time"],
        "sedentary_time": activity_rec["sedentary_time"],
        "workout_count": len(day_workouts),
        "workouts": [
            {
                "activity": w["activity"],
                "intensity": w["intensity"],
                "calories": w["calories"],
                "distance": w["distance"],
                "start_datetime": w["start_datetime"],
                "end_datetime": w["end_datetime"],
                "source": w["source"],
            }
            for w in day_workouts
        ],
    }


def main():
    readiness = fetch("daily_readiness", START_DATE, END_DATE)
    sleep_records = fetch("sleep", START_DATE, END_DATE)
    sleep_by_day = {r["day"]: r for r in sleep_records if r["type"] == "long_sleep"}

    activity_records = fetch("daily_activity", START_DATE, END_DATE)
    workout_records = fetch("workout", START_DATE, END_DATE)
    workouts_by_day = {}
    for w in workout_records:
        workouts_by_day.setdefault(w["day"], []).append(w)

    recovery_rows = [to_recovery_row(r, sleep_by_day) for r in readiness]
    activity_rows = [to_activity_row(r, workouts_by_day) for r in activity_records]

    supabase_client.upsert("recovery", recovery_rows, conflict_column="date")
    supabase_client.upsert("activity", activity_rows, conflict_column="date")

    print(f"Upserted {len(recovery_rows)} recovery rows and {len(activity_rows)} activity rows.")


if __name__ == "__main__":
    main()
