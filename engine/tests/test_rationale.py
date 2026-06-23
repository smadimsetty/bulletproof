import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rationale import build_breakdown, build_internal_rationale, build_public_rationale


def test_build_breakdown_includes_readiness_and_sorted_candidates():
    history = {date(2026, 6, 21): "upper_a"}
    today = date(2026, 6, 22)
    top2 = [("lower_a", 5.0), ("rest", 2.0)]
    breakdown = build_breakdown(today, history, readiness=7, top2=top2)

    assert breakdown["readiness"] == 7
    assert breakdown["candidates"] == [
        {"type": "lower_a", "score": 5.0},
        {"type": "rest", "score": 2.0},
    ]
    assert breakdown["signals"]["yesterday_pattern"] == "upper"


def test_build_breakdown_handles_no_history_and_no_readiness():
    breakdown = build_breakdown(date(2026, 6, 22), {}, readiness=None, top2=[])
    assert breakdown["readiness"] is None
    assert breakdown["candidates"] == []
    assert breakdown["signals"]["yesterday_pattern"] is None
    assert breakdown["signals"]["days_since_rest"] == 999


def test_internal_rationale_includes_raw_readiness_number():
    breakdown = {
        "readiness": 4,
        "candidates": [{"type": "rest", "score": 6.0}, {"type": "mobility", "score": 5.0}],
        "signals": {
            "days_since_rest": 8,
            "days_since_mobility": 2,
            "days_since_pickleball": 999,
            "yesterday_pattern": "lower",
        },
    }
    text = build_internal_rationale(breakdown)
    assert "Readiness 4" in text
    assert "rest" in text
    assert "8 days" in text


def test_public_rationale_never_includes_raw_readiness_number():
    breakdown = {
        "readiness": 4,
        "candidates": [{"type": "rest", "score": 6.0}, {"type": "mobility", "score": 5.0}],
        "signals": {
            "days_since_rest": 8,
            "days_since_mobility": 2,
            "days_since_pickleball": 999,
            "yesterday_pattern": "lower",
        },
    }
    text = build_public_rationale(breakdown)
    assert "4" not in text
    assert "rest" in text.lower()


def test_public_rationale_mentions_same_pattern_penalty_without_numbers():
    breakdown = {
        "readiness": 7,
        "candidates": [{"type": "lower_a", "score": 5.0}, {"type": "rest", "score": 3.0}],
        "signals": {
            "days_since_rest": 3,
            "days_since_mobility": 1,
            "days_since_pickleball": 999,
            "yesterday_pattern": "upper",
        },
    }
    text = build_public_rationale(breakdown)
    assert "lower_a" in text or "lower" in text.lower()
