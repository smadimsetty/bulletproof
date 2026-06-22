import csv
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env_loader import load_env
import supabase_client

load_env()

HERE = os.path.dirname(os.path.abspath(__file__))
STRONG_CSV = os.path.join(HERE, "strong_workouts.csv")
OUTPUT_CSV = os.path.join(HERE, "session_candidates.csv")

LOWER_KEYWORDS = ["squat", "deadlift", "leg", "lunge", "calf", "hip", "glute"]


def classify_gym_day(exercise_names):
    lowered = [e.lower() for e in exercise_names]
    if any(kw in name for name in lowered for kw in LOWER_KEYWORDS):
        return "lower_a"
    return "upper_a"


def load_gym_days():
    gym_exercises_by_day = defaultdict(list)
    with open(STRONG_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            day = row["Date"].split(" ")[0]
            gym_exercises_by_day[day].append(row["Exercise Name"])
    return {day: classify_gym_day(names) for day, names in gym_exercises_by_day.items()}


def load_activity_days():
    rows = supabase_client.get("activity", {"select": "date,workouts"})
    activity_by_day = {}
    for r in rows:
        activity_by_day[r["date"]] = [w["activity"] for w in r["workouts"]]
    return activity_by_day


def classify_non_gym_day(activities):
    if "pickleball" in activities:
        return "pickleball", "oura_workout"
    if "running" in activities:
        return "run", "oura_workout"
    if "flexibility" in activities:
        return "mobility", "oura_workout"
    return "rest", "no_signal"


def main():
    gym_days = load_gym_days()
    activity_by_day = load_activity_days()

    all_days = sorted(set(gym_days) | set(activity_by_day))
    rows = []
    for day in all_days:
        if day in gym_days:
            rows.append({
                "date": day,
                "session_type": gym_days[day],
                "source": "strong_export",
                "needs_review": "variant_unconfirmed",
            })
        else:
            activities = activity_by_day.get(day, [])
            session_type, source = classify_non_gym_day(activities)
            rows.append({
                "date": day,
                "session_type": session_type,
                "source": source,
                "needs_review": "" if source == "oura_workout" else "no_signal_defaulted_to_rest",
            })

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "session_type", "source", "needs_review"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} candidate rows to {OUTPUT_CSV}")
    flagged = sum(1 for r in rows if r["needs_review"])
    print(f"{flagged} rows flagged needs_review")


if __name__ == "__main__":
    main()
