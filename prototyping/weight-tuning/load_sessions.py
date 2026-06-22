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
