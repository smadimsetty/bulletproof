# Phase 2 — Weight-Tuning Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 4 contains an interactive human-review step (Step 4) that must be done by the controller directly with Sohan, not delegated to a subagent** — see that task for details.

**Goal:** Pull Sohan's full Oura history via the API into Supabase (`recovery` + a new `activity` table), reconstruct what training actually happened each day from the Strong export + Oura's auto-detected workouts, and build a Python "notebook" that runs the `CLAUDE.md` scoring rules against that real history so the weights can be tuned by inspection before any engine code is written.

**Architecture:** All new code is throwaway/exploratory and lives in `prototyping/weight-tuning/` (not `engine/`) per the approved design spec. Scripts are stdlib-only (`urllib`, `json`, `csv`) talking directly to the Oura REST API and Supabase's PostgREST API — no new dependency on `engine/pyproject.toml`. The one new schema object (`activity` table) is a versioned migration, same pattern as Phase 0/1. The final notebook uses the VS Code/Jupyter "percent" cell format (`# %%` markers in a plain `.py` file) instead of a raw `.ipynb` JSON file — functionally identical interactive experience in VS Code's Python extension, far more diffable in git.

**Tech Stack:** Python 3.11+ stdlib for all glue scripts, `pytest` for the scoring-function unit tests, `pandas`/`jupyter`/`ipykernel` only for the final notebook (isolated to `prototyping/weight-tuning/requirements.txt`).

## Global Constraints

- All new personal-data exports (the Strong CSV, reconstructed session-history CSVs) are gitignored — this repo is public, and training/health history is not portfolio content. Only code is committed.
- `OURA_PERSONAL_ACCESS_TOKEN` lives only in the repo-root `.env` (already gitignored). Never print it, log it, or commit it.
- The new `activity` table follows the exact RLS pattern already established for `recovery`: `enable row level security`, zero `anon`/`authenticated` policies, service-role-only access.
- `recovery.subjective_readiness` keeps its existing `smallint check (subjective_readiness between 1 and 10)` constraint unchanged. Oura's native 0-100 readiness score is rescaled to this column via `max(1, min(10, round(score / 10)))` before insert — this was an explicit decision (no new column), confirmed against real Oura data (scores observed in the 50-93 range for Sohan's account).
- The `sessions` table has **no unique constraint on `date`** (unlike `recovery`/`activity`, which do). Backfilling into `sessions` must use a plain insert, never an `on_conflict` upsert — PostgREST will reject an upsert against a column with no matching unique constraint.
- The new `activity` table reuses the existing `set_updated_at()` trigger function (defined in migration `20260622002432_fix_view_security_and_updated_at_triggers.sql`) rather than redefining it.
- Oura API base URL: `https://api.ouraring.com/v2/usercollection`. Auth: `Authorization: Bearer <token>` header. Date range params: `start_date`/`end_date` as `YYYY-MM-DD` (inclusive). Pagination: response has a top-level `data` array and a `next_token` (null when there are no more pages) — confirmed empirically that Sohan's full history (608 `daily_readiness` records, 862 `workout` records, range 2024-08-21 to 2026-06-21) fits in a single page (`next_token: null`), but the client must still loop on `next_token` defensively.
- Confirmed real Oura field shapes (from live exploration this session — do not re-derive, use these):
  - `daily_readiness` record: `day` (date string), `score` (int 0-100), `contributors` (dict of sub-scores, not used in this phase).
  - `sleep` record: `day`, `type` (one of `"long_sleep"`, `"sleep"`, `"late_nap"` — **filter to `type == "long_sleep"` for the main night's metrics**, since most days have 2+ sleep records), `total_sleep_duration` (int, seconds), `average_hrv` (number, ms), `lowest_heart_rate` (int, bpm).
  - `daily_activity` record: `day`, `score` (int 0-100), `total_calories` (int), `active_calories` (int), `steps` (int), `high_activity_time`/`medium_activity_time`/`low_activity_time`/`sedentary_time` (int, seconds).
  - `workout` record: `day`, `activity` (string — confirmed real values for this account include `"pickleball"`, `"running"`, `"walking"`, `"houseWork"`, `"tableTennis"`, `"tennis"`, `"yardwork"`, `"dance"`, `"flexibility"`), `intensity` (string), `calories` (float), `distance` (float or null), `start_datetime`/`end_datetime` (ISO datetime strings), `source` (string, e.g. `"confirmed"`).
- Confirmed real Strong export header (`prototyping/weight-tuning/strong_workouts.csv`, already present, 1681 data rows, 107 distinct workout days spanning 2025-04-15 to 2026-06-20): `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE`. `Date` is `"YYYY-MM-DD HH:MM:SS"`.

---

### Task 1: `.gitignore` update + Oura API client + exploration script

**Files:**
- Modify: `.gitignore`
- Create: `prototyping/weight-tuning/env_loader.py`
- Create: `prototyping/weight-tuning/oura_client.py`
- Create: `prototyping/weight-tuning/oura_explore.py`

**Interfaces:**
- Produces: `env_loader.load_env()` — loads repo-root `.env` into `os.environ`. `oura_client.fetch(endpoint: str, start_date: str, end_date: str) -> list[dict]` — fetches all records (following pagination) for an Oura usercollection endpoint. Both are imported by every later task's scripts via `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`.

- [ ] **Step 1: Add the gitignore rule for personal data exports**

Add this block to `.gitignore` (append at the end):

```
# Personal data exports (sensitive, not for the public repo)
prototyping/weight-tuning/*.csv
```

- [ ] **Step 2: Verify the Strong export is now ignored**

Run: `git check-ignore -v prototyping/weight-tuning/strong_workouts.csv`
Expected: prints `.gitignore:<line>:prototyping/weight-tuning/*.csv	prototyping/weight-tuning/strong_workouts.csv` (confirms it matches the new rule). If it prints nothing, the rule didn't take — check for typos before proceeding.

- [ ] **Step 3: Write `env_loader.py`**

```python
import os


def load_env():
    """Load key=value pairs from the repo-root .env file into os.environ."""
    here = os.path.abspath(os.path.dirname(__file__))
    root = here
    while not os.path.isdir(os.path.join(root, ".git")):
        parent = os.path.dirname(root)
        if parent == root:
            raise RuntimeError("Could not locate repo root (no .git directory found)")
        root = parent
    env_path = os.path.join(root, ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ[key.strip()] = value.strip()
```

- [ ] **Step 4: Write `oura_client.py`**

```python
import json
import os
import urllib.parse
import urllib.request

BASE_URL = "https://api.ouraring.com/v2/usercollection"


def fetch(endpoint, start_date, end_date):
    """Fetch all records (following pagination) for an Oura usercollection endpoint.

    endpoint: one of "daily_readiness", "daily_sleep", "sleep", "daily_activity", "workout"
    start_date / end_date: "YYYY-MM-DD" strings, inclusive
    Returns: list of record dicts.
    """
    token = os.environ["OURA_PERSONAL_ACCESS_TOKEN"]
    records = []
    next_token = None
    while True:
        params = {"start_date": start_date, "end_date": end_date}
        if next_token:
            params["next_token"] = next_token
        url = f"{BASE_URL}/{endpoint}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req) as resp:
            body = json.load(resp)
        records.extend(body["data"])
        next_token = body.get("next_token")
        if not next_token:
            break
    return records
```

- [ ] **Step 5: Write `oura_explore.py`**

```python
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env_loader import load_env
from oura_client import fetch

load_env()

ENDPOINTS = ["daily_readiness", "daily_sleep", "sleep", "daily_activity", "workout"]

for endpoint in ENDPOINTS:
    records = fetch(endpoint, "2026-06-01", "2026-06-10")
    print(f"=== {endpoint}: {len(records)} records in sample window ===")
    if records:
        print(json.dumps(records[0], indent=2, default=str))
    print()
```

- [ ] **Step 6: Run it**

Run: `python prototyping/weight-tuning/oura_explore.py`
Expected: prints 5 sections, one per endpoint, each showing a real sample record. `daily_readiness` shows a `score` field (0-100 range); `sleep` shows `type`, `total_sleep_duration`, `average_hrv`, `lowest_heart_rate`; `daily_activity` shows `score`, `total_calories`, `steps`; `workout` shows an `activity` field (this account has real `"pickleball"` and `"running"` entries, though the first record in the sample window may be a different activity type like `"walking"`).

- [ ] **Step 7: Commit**

```bash
git add .gitignore prototyping/weight-tuning/env_loader.py prototyping/weight-tuning/oura_client.py prototyping/weight-tuning/oura_explore.py
git commit -m "feat: add Oura API client and exploration script"
```

---

### Task 2: Migration — `activity` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_activity.sql`

**Interfaces:**
- Produces: table `activity(id, date unique, activity_score, total_calories, active_calories, steps, high_activity_time, medium_activity_time, low_activity_time, sedentary_time, workout_count, workouts jsonb, created_at, updated_at)`, service-role-only, `updated_at` auto-maintained via the existing `set_updated_at()` trigger function. Task 3's backfill script writes here.

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new create_activity`

- [ ] **Step 2: Write the migration**

Replace the generated file's contents with:

```sql
create table activity (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  activity_score smallint check (activity_score between 0 and 100),
  total_calories integer,
  active_calories integer,
  steps integer,
  high_activity_time integer,
  medium_activity_time integer,
  low_activity_time integer,
  sedentary_time integer,
  workout_count integer not null default 0,
  workouts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table activity enable row level security;

-- Deliberately no anon/authenticated policies: daily activity detail is as
-- personal as recovery data and is service-role-only, same as recovery.

create trigger set_updated_at_activity
  before update on activity
  for each row
  execute function set_updated_at();
```

- [ ] **Step 3: Push**

Run: `npx supabase db push`
Expected: migration applies successfully.

- [ ] **Step 4: Verify with a service-role insert, then confirm anon is blocked**

```bash
set -a; source .env; set +a
curl -s -X POST "$SUPABASE_URL/rest/v1/activity" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"date":"2026-06-21","activity_score":90,"total_calories":2000,"active_calories":400,"steps":8000,"workout_count":0,"workouts":[]}'
```
Expected: returns the inserted row.

```bash
curl -s "$SUPABASE_URL/rest/v1/activity?select=date" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `[]`

- [ ] **Step 5: Clean up the test row**

```bash
curl -s -X DELETE "$SUPABASE_URL/rest/v1/activity?date=eq.2026-06-21" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: empty response, row removed (Task 3's real backfill will populate this date for real).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add activity table"
```

---

### Task 3: Historical backfill script (recovery + activity)

**Files:**
- Create: `prototyping/weight-tuning/supabase_client.py`
- Create: `prototyping/weight-tuning/oura_pull.py`

**Interfaces:**
- Consumes: `env_loader.load_env`, `oura_client.fetch` (Task 1); `activity` table (Task 2)
- Produces: `supabase_client.get(table, params) -> list[dict]` (PostgREST returns a bare JSON array for table queries, unlike Oura's `{"data": [...]}` shape), `supabase_client.upsert(table, rows, conflict_column)`, `supabase_client.insert(table, rows)` — all three are imported by Task 4's and Task 5's scripts.

- [ ] **Step 1: Write `supabase_client.py`**

```python
import json
import os
import urllib.parse
import urllib.request


def _headers():
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def get(table, params):
    url = os.environ["SUPABASE_URL"] + f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def upsert(table, rows, conflict_column):
    """Upsert rows into a Supabase table via PostgREST, merging on
    conflict_column (which must have a unique constraint)."""
    if not rows:
        return
    url = os.environ["SUPABASE_URL"] + f"/rest/v1/{table}?on_conflict={conflict_column}"
    headers = _headers()
    headers["Prefer"] = "resolution=merge-duplicates"
    data = json.dumps(rows, default=str).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        resp.read()


def insert(table, rows):
    """Plain insert, no upsert. Use for tables with no unique constraint on
    the natural key (e.g. sessions, which allows multiple rows per date)."""
    if not rows:
        return
    url = os.environ["SUPABASE_URL"] + f"/rest/v1/{table}"
    headers = _headers()
    data = json.dumps(rows, default=str).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        resp.read()
```

- [ ] **Step 2: Write `oura_pull.py`**

```python
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
```

- [ ] **Step 3: Run it**

Run: `python prototyping/weight-tuning/oura_pull.py`
Expected: `Upserted 608 recovery rows and <N> activity rows.` (recovery count should match the 608 confirmed `daily_readiness` records; activity count will be close to but possibly not identical, since `daily_activity` and `daily_readiness` can have slightly different day coverage at the edges of the range).

- [ ] **Step 4: Spot-check one known day against the values confirmed during exploration**

```bash
set -a; source .env; set +a
curl -s "$SUPABASE_URL/rest/v1/recovery?select=date,sleep_hrs,hrv,resting_hr,subjective_readiness&date=eq.2026-06-02" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: one row with `subjective_readiness: 8` (readiness score 81 → round(81/10)=8), `hrv: 80`, `resting_hr: 50`, `sleep_hrs` approximately `9.12` or `9.13` (32850 seconds / 3600).

```bash
curl -s "$SUPABASE_URL/rest/v1/activity?select=date,activity_score,steps,workout_count&date=eq.2026-06-01" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: one row with `activity_score: 98`, `steps: 796`.

- [ ] **Step 5: Commit**

```bash
git add prototyping/weight-tuning/supabase_client.py prototyping/weight-tuning/oura_pull.py
git commit -m "feat: add historical Oura backfill script for recovery and activity"
```

---

### Task 4: Session-history reconstruction

**Files:**
- Create: `prototyping/weight-tuning/build_session_candidates.py`
- Create: `prototyping/weight-tuning/load_sessions.py`

**Interfaces:**
- Consumes: `supabase_client` (Task 3); `activity` table populated by Task 3's backfill; `prototyping/weight-tuning/strong_workouts.csv` (already present)
- Produces: `sessions` table rows for the full backfilled history window.

**This task has a mandatory human-review step (Step 4) that the controller must do directly with Sohan — do not delegate the candidate-generation script's output review to a subagent.** The script-writing steps (1-3, 6-7) are normal delegatable work.

- [ ] **Step 1: Write `build_session_candidates.py`**

```python
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
```

Note on the classification heuristic: gym days are tagged `upper_a`/`lower_a` only (never `_b`) because Strong's export has no signal distinguishing an "A" workout from a "B" workout in this program — `CLAUDE.md` never defined what differentiates them either. Every gym day is flagged `variant_unconfirmed` so this is visible, not silently guessed.

- [ ] **Step 2: Run it**

Run: `python prototyping/weight-tuning/build_session_candidates.py`
Expected: `Wrote <N> candidate rows to .../session_candidates.csv`, followed by a flagged-row count. Given the Strong export only starts 2025-04-15 while Oura history starts 2024-08-21, expect heavy `no_signal_defaulted_to_rest` flagging for the ~8 months before Strong tracking began — this is real, visible data-quality information for Step 4's review, not a bug.

- [ ] **Step 3: Commit the script (not the generated CSV — it's gitignored)**

```bash
git add prototyping/weight-tuning/build_session_candidates.py
git commit -m "feat: add session-history candidate builder"
```

- [ ] **Step 4: Human review with Sohan (controller does this directly, not a subagent)**

Open `prototyping/weight-tuning/session_candidates.csv`. Walk through it with Sohan:
- For every `needs_review: variant_unconfirmed` row (gym days), ask if he can recall whether it was the "A" or "B" workout, or leave as `upper_a`/`lower_a` if he doesn't distinguish them in practice.
- For every `needs_review: no_signal_defaulted_to_rest` row, ask if he remembers doing anything that day (pickleball not tagged by Oura, an untracked mobility session, etc.) or if it should stay `rest`.
- Sohan may reasonably decide to bulk-accept `rest` for long stretches before he started any structured tracking, rather than reviewing every single day individually — that's his call, not something to decide unilaterally.

Save the corrected file as `prototyping/weight-tuning/session_candidates_final.csv` (same columns; `needs_review` column can be dropped or left in, `load_sessions.py` in Step 5 only reads `date` and `session_type`).

- [ ] **Step 5: Write `load_sessions.py`**

```python
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env_loader import load_env
import supabase_client

load_env()

HERE = os.path.dirname(os.path.abspath(__file__))
INPUT_CSV = os.path.join(HERE, "session_candidates_final.csv")


def main():
    rows = []
    with open(INPUT_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append({"date": row["date"], "type": row["session_type"]})
    supabase_client.insert("sessions", rows)
    print(f"Inserted {len(rows)} session rows.")


if __name__ == "__main__":
    main()
```

`sessions` has no unique constraint on `date`, so this is a plain insert (see Global Constraints) — if this script is ever re-run, delete existing rows first via the service role to avoid duplicates: `curl -X DELETE "$SUPABASE_URL/rest/v1/sessions?date=gte.2024-08-21" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"`.

- [ ] **Step 6: Run it**

Run: `python prototyping/weight-tuning/load_sessions.py`
Expected: `Inserted <N> session rows.` where N matches the row count of `session_candidates_final.csv`.

- [ ] **Step 7: Verify**

```bash
set -a; source .env; set +a
curl -s "$SUPABASE_URL/rest/v1/sessions?select=type&order=date" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python -c "import json,sys; print(len(json.load(sys.stdin)))"
```
Expected: prints a count matching Step 6's insert count.

- [ ] **Step 8: Commit**

```bash
git add prototyping/weight-tuning/load_sessions.py
git commit -m "feat: add session-history loader"
```

---

### Task 5: Weight-tuning notebook

**Files:**
- Create: `prototyping/weight-tuning/requirements.txt`
- Create: `prototyping/weight-tuning/scoring.py`
- Create: `prototyping/weight-tuning/test_scoring.py`
- Create: `prototyping/weight-tuning/weight_tuning.py`
- Modify: `prototyping/weight-tuning/README.md`

**Interfaces:**
- Consumes: `supabase_client.get` (Task 3); `recovery`/`sessions` tables populated by Tasks 3-4
- Produces: a runnable comparison of the scoring engine's recommendation against real history, for Sohan to iterate on directly.

- [ ] **Step 1: Write `requirements.txt`**

```
jupyter
ipykernel
pandas
pytest
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -r prototyping/weight-tuning/requirements.txt`
Expected: installs successfully.

- [ ] **Step 3: Write the failing tests for the scoring functions**

Create `prototyping/weight-tuning/test_scoring.py`:

```python
from datetime import date

from scoring import days_since, pattern_of, recommend, score_candidate


def test_pattern_of_collapses_upper_variants():
    assert pattern_of("upper_a") == "upper"
    assert pattern_of("upper_b") == "upper"


def test_pattern_of_collapses_lower_variants():
    assert pattern_of("lower_a") == "lower"
    assert pattern_of("lower_b") == "lower"


def test_pattern_of_passes_through_other_types():
    assert pattern_of("pickleball") == "pickleball"
    assert pattern_of("rest") == "rest"


def test_days_since_finds_most_recent_match():
    history = {
        date(2026, 1, 1): "rest",
        date(2026, 1, 3): "upper_a",
    }
    assert days_since(history, date(2026, 1, 5), "rest") == 4


def test_days_since_returns_large_number_when_never_found():
    history = {date(2026, 1, 3): "upper_a"}
    assert days_since(history, date(2026, 1, 5), "rest") == 999


def test_readiness_gate_blocks_non_rest_candidates():
    history = {}
    score = score_candidate("upper_a", date(2026, 1, 5), history, readiness=2)
    assert score is None


def test_readiness_gate_allows_rest_and_mobility():
    history = {}
    assert score_candidate("rest", date(2026, 1, 5), history, readiness=2) is not None
    assert score_candidate("mobility", date(2026, 1, 5), history, readiness=2) is not None


def test_same_pattern_as_yesterday_is_penalized():
    history = {date(2026, 1, 4): "upper_a"}
    today = date(2026, 1, 5)
    penalized = score_candidate("upper_a", today, history, readiness=7)
    unpenalized = score_candidate("lower_a", today, history, readiness=7)
    assert penalized < unpenalized


def test_pickleball_blocked_when_played_yesterday():
    history = {date(2026, 1, 4): "pickleball"}
    assert score_candidate("pickleball", date(2026, 1, 5), history, readiness=8) is None


def test_pickleball_blocked_when_readiness_too_low():
    history = {}
    assert score_candidate("pickleball", date(2026, 1, 5), history, readiness=4) is None


def test_recommend_returns_top_two_sorted_by_score():
    history = {date(2026, 1, 4): "upper_a"}
    today = date(2026, 1, 5)
    top2 = recommend(today, history, readiness=7)
    assert len(top2) == 2
    assert top2[0][1] >= top2[1][1]
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd prototyping/weight-tuning && python -m pytest test_scoring.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scoring'` (the module doesn't exist yet).

- [ ] **Step 5: Write `scoring.py`**

```python
from datetime import timedelta

CANDIDATES = ["upper_a", "lower_a", "pickleball", "run", "rest", "mobility"]

WEIGHTS = {
    "base_rotation": 1.0,
    "readiness_gate_threshold": 3,
    "rest_overdue_bonus": 5.0,
    "rest_overdue_days": 7,
    "mobility_overdue_bonus": 4.0,
    "mobility_overdue_days": 4,
    "same_pattern_penalty": 6.0,
    "pickleball_min_readiness": 6,
    "pickleball_min_days_since": 2,
    "run_after_pickleball_bonus": 2.0,
}


def pattern_of(session_type):
    if session_type.startswith("upper"):
        return "upper"
    if session_type.startswith("lower"):
        return "lower"
    return session_type


def days_since(history, day, session_type_pattern):
    """Number of days since the most recent day (before `day`) whose pattern
    matches session_type_pattern. Returns 999 if never found in the last 60 days."""
    for offset in range(1, 60):
        d = day - timedelta(days=offset)
        entry = history.get(d)
        if entry and pattern_of(entry) == session_type_pattern:
            return offset
    return 999


def score_candidate(candidate, day, history, readiness, weights=WEIGHTS):
    score = weights["base_rotation"]
    pattern = pattern_of(candidate)

    if readiness is not None and readiness <= weights["readiness_gate_threshold"]:
        if candidate not in ("rest", "mobility"):
            return None
        score += 10

    if candidate == "rest":
        since_rest = days_since(history, day, "rest")
        if since_rest >= weights["rest_overdue_days"]:
            score += weights["rest_overdue_bonus"]

    if candidate == "mobility":
        since_mobility = days_since(history, day, "mobility")
        if since_mobility >= weights["mobility_overdue_days"]:
            score += weights["mobility_overdue_bonus"]

    yesterday = history.get(day - timedelta(days=1))
    if yesterday and pattern in ("upper", "lower") and pattern_of(yesterday) == pattern:
        score -= weights["same_pattern_penalty"]

    if candidate == "pickleball":
        since_pickleball = days_since(history, day, "pickleball")
        if since_pickleball < weights["pickleball_min_days_since"]:
            return None
        if readiness is not None and readiness < weights["pickleball_min_readiness"]:
            return None

    if candidate == "run" and yesterday and pattern_of(yesterday) == "pickleball":
        score += weights["run_after_pickleball_bonus"]

    return score


def recommend(day, history, readiness):
    scored = []
    for candidate in CANDIDATES:
        s = score_candidate(candidate, day, history, readiness)
        if s is not None:
            scored.append((candidate, s))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:2]
```

This intentionally does not yet implement the run 10%-progression cap or the ~10-day target-ratio balancing from `CLAUDE.md` — those need design choices (what the ratio-bonus formula looks like, how to track weekly run mileage) that are exactly the kind of thing Sohan should shape interactively once he's looking at real comparison output in Step 9, not something to guess at in this plan.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd prototyping/weight-tuning && python -m pytest test_scoring.py -v`
Expected: all 10 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prototyping/weight-tuning/scoring.py prototyping/weight-tuning/test_scoring.py prototyping/weight-tuning/requirements.txt
git commit -m "feat: add scoring engine prototype with unit tests"
```

- [ ] **Step 8: Write `weight_tuning.py`**

```python
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
```

- [ ] **Step 9: Run it and review the output**

Open `prototyping/weight-tuning/weight_tuning.py` in VS Code and run it with the Python extension's "Run Below" / interactive-window feature (each `# %%` becomes a runnable cell), or run non-interactively to confirm it executes end-to-end: `cd prototyping/weight-tuning && python weight_tuning.py`.
Expected: no errors; prints the loaded row counts, a match-rate percentage, and a table of mismatched days. Review the match rate and mismatches with Sohan — this is the actual "does this look right" check from the spec's verification approach, and the starting point for him to adjust `WEIGHTS`.

- [ ] **Step 10: Update the README**

Replace `prototyping/weight-tuning/README.md` contents with:

```markdown
# prototyping/weight-tuning

Phase 2 of the roadmap: pulls Sohan's full Oura history via the API into
Supabase (`recovery` + `activity` tables), reconstructs session history from
the Strong export + Oura's auto-detected workouts, and prototypes the
`CLAUDE.md` scoring weights against that real data before any engine code is
written. See `docs/superpowers/specs/2026-06-21-phase2-weight-tuning-design.md`.

## Scripts (run in this order for a fresh backfill)

1. `oura_explore.py` — dumps sample Oura API responses (read-only, no writes)
2. `oura_pull.py` — backfills `recovery` and `activity` from full Oura history
3. `build_session_candidates.py` — proposes `session_candidates.csv` from the
   Strong export + Oura workout data; review and save as
   `session_candidates_final.csv` before the next step
4. `load_sessions.py` — loads the reviewed candidates into `sessions`

## Notebook

`weight_tuning.py` — open in VS Code (Python extension's `# %%` cell support)
or run directly with `python weight_tuning.py`. Compares the scoring engine
in `scoring.py` against real history. Tune `scoring.WEIGHTS` and re-run.

`scoring.py` / `test_scoring.py` — the scoring engine and its unit tests
(`pytest test_scoring.py`).

Personal data files (`strong_workouts.csv`, `session_candidates*.csv`) are
gitignored — this repo is public.
```

- [ ] **Step 11: Commit**

```bash
git add prototyping/weight-tuning/weight_tuning.py prototyping/weight-tuning/README.md
git commit -m "feat: add weight-tuning notebook comparing scoring engine to real history"
git push
```
