import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run_daily import build_recommendation_row


def test_build_recommendation_row_with_two_candidates():
    today = date(2026, 6, 22)
    top2 = [("lower", 5.0), ("rest", 2.0)]
    breakdown = {"readiness": 7, "candidates": [], "signals": {}}
    row = build_recommendation_row(
        today, top2, breakdown, "internal text", "public text"
    )
    assert row == {
        "date": "2026-06-22",
        "top_pick": "lower",
        "runner_up": "rest",
        "score_breakdown": breakdown,
        "internal_rationale": "internal text",
        "public_rationale": "public text",
        "owner_id": "00000000-0000-0000-0000-000000000000",
    }


def test_build_recommendation_row_with_only_one_candidate():
    today = date(2026, 6, 22)
    top2 = [("rest", 12.0)]
    breakdown = {"readiness": 2, "candidates": [], "signals": {}}
    row = build_recommendation_row(
        today, top2, breakdown, "internal text", "public text"
    )
    assert row["top_pick"] == "rest"
    assert row["runner_up"] is None


def test_build_recommendation_row_raises_when_no_candidates_survive():
    today = date(2026, 6, 22)
    breakdown = {"readiness": None, "candidates": [], "signals": {}}
    with pytest.raises(ValueError, match="no candidates"):
        build_recommendation_row(today, [], breakdown, "internal text", "public text")
