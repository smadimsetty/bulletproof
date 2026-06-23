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
