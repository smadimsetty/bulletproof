import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
        date(2026, 1, 3): "upper",
    }
    assert days_since(history, date(2026, 1, 5), "rest") == 4


def test_days_since_returns_large_number_when_never_found():
    history = {date(2026, 1, 3): "upper"}
    assert days_since(history, date(2026, 1, 5), "rest") == 999


def test_readiness_gate_blocks_non_rest_candidates():
    history = {}
    score = score_candidate("upper", date(2026, 1, 5), history, readiness=2)
    assert score is None


def test_readiness_gate_allows_rest_and_mobility():
    history = {}
    assert score_candidate("rest", date(2026, 1, 5), history, readiness=2) is not None
    assert score_candidate("mobility", date(2026, 1, 5), history, readiness=2) is not None


def test_same_pattern_as_yesterday_is_penalized():
    history = {date(2026, 1, 4): "upper"}
    today = date(2026, 1, 5)
    penalized = score_candidate("upper", today, history, readiness=7)
    unpenalized = score_candidate("lower", today, history, readiness=7)
    assert penalized < unpenalized


def test_pickleball_blocked_when_played_yesterday():
    history = {date(2026, 1, 4): "pickleball"}
    assert score_candidate("pickleball", date(2026, 1, 5), history, readiness=8) is None


def test_pickleball_blocked_when_readiness_too_low():
    history = {}
    assert score_candidate("pickleball", date(2026, 1, 5), history, readiness=4) is None


def test_recommend_returns_top_two_sorted_by_score():
    history = {date(2026, 1, 4): "upper"}
    today = date(2026, 1, 5)
    top2 = recommend(today, history, readiness=7)
    assert len(top2) == 2
    assert top2[0][1] >= top2[1][1]


def test_recommend_returns_only_rest_and_mobility_when_readiness_critical():
    history = {}
    today = date(2026, 1, 5)
    top2 = recommend(today, history, readiness=2)
    picks = {c for c, _ in top2}
    assert picks <= {"rest", "mobility"}
