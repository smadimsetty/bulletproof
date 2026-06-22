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
