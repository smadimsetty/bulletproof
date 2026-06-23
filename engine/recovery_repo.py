import oura_client
import supabase_client


def to_recovery_row(readiness_rec, sleep_by_day):
    """Build a `recovery` table row from one Oura daily_readiness record,
    rescaling Oura's 0-100 readiness score to the table's 1-10
    subjective_readiness column (see CLAUDE.md's "To verify at build time"
    note on this rescaling)."""
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


def pull_and_upsert_today(today):
    """Fetch today's Oura readiness (+ matching sleep) record, upsert one
    row into `recovery`, and return the subjective_readiness value for
    today (1-10), or None if Oura has no readiness record yet for today
    (e.g. the ring hasn't synced) -- callers must treat None as "no
    readiness signal available", not an error."""
    day_str = today.isoformat()
    readiness_records = oura_client.fetch("daily_readiness", day_str, day_str)
    if not readiness_records:
        return None

    sleep_records = oura_client.fetch("sleep", day_str, day_str)
    sleep_by_day = {r["day"]: r for r in sleep_records if r["type"] == "long_sleep"}

    row = to_recovery_row(readiness_records[0], sleep_by_day)
    supabase_client.upsert("recovery", [row], "date")
    return row["subjective_readiness"]
