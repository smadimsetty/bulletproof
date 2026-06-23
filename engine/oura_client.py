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
