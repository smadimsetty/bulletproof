import os
import sys
from datetime import timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import weather_client

CANDIDATES = ["upper", "lower", "pickleball", "run", "rest", "mobility"]

# The day_labels a strength-pattern penalty applies over when the caller
# doesn't pass a real preferred_split.day_labels (e.g. existing callers/tests
# written before split-awareness, or a profile with no split set yet).
# Matches CANDIDATES' own two strength types -- this is "upper_lower" in
# split_taxonomy terms, the only split CANDIDATES currently produces (see
# design spec Decision 4: CANDIDATES itself stays the 6 simplified types
# this phase; only the plumbing becomes split-aware).
DEFAULT_DAY_LABELS = ["upper", "lower"]

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


def pattern_of(session_type, day_labels=None):
    """Returns the rotation "pattern" a session_type belongs to, for the
    same-pattern-as-yesterday penalty. day_labels (from the user's
    preferred_split.split_taxonomy.day_labels) names which session_type
    values are strength-day labels that should penalize repetition;
    defaults to DEFAULT_DAY_LABELS (upper/lower) when omitted, so every
    pre-split-aware caller keeps working unchanged. upper_a/upper_b/
    lower_a/lower_b collapse to their base pattern for backward
    compatibility with any history rows still carrying the dropped v1
    enum values."""
    if session_type.startswith("upper"):
        return "upper"
    if session_type.startswith("lower"):
        return "lower"
    labels = day_labels if day_labels is not None else DEFAULT_DAY_LABELS
    if session_type in labels:
        return session_type
    return session_type


def days_since(history, day, session_type_pattern, day_labels=None):
    """Number of days since the most recent day (before `day`) whose pattern
    matches session_type_pattern. Returns 999 if never found in the last 60 days."""
    for offset in range(1, 60):
        d = day - timedelta(days=offset)
        entry = history.get(d)
        if entry and pattern_of(entry, day_labels=day_labels) == session_type_pattern:
            return offset
    return 999


def _is_pickleball_weather_blocked(location):
    """Returns True only if the weather is confirmed bad. Any missing
    location or any failure talking to the weather API degrades open
    (returns False, i.e. "not blocked") -- per the v2 design spec's
    explicit instruction that a down weather API must never block
    pickleball, only skip the check for that day."""
    if not location or location.get("lat") is None or location.get("lon") is None:
        return False
    try:
        return weather_client.is_bad_for_pickleball(location["lat"], location["lon"])
    except Exception:
        return False


def score_candidate(candidate, day, history, readiness, weights=WEIGHTS, day_labels=None, location=None):
    score = weights["base_rotation"]
    pattern = pattern_of(candidate, day_labels=day_labels)

    if readiness is not None and readiness <= weights["readiness_gate_threshold"]:
        if candidate not in ("rest", "mobility"):
            return None
        score += 10

    if candidate == "rest":
        since_rest = days_since(history, day, "rest", day_labels=day_labels)
        if since_rest >= weights["rest_overdue_days"]:
            score += weights["rest_overdue_bonus"]

    if candidate == "mobility":
        since_mobility = days_since(history, day, "mobility", day_labels=day_labels)
        if since_mobility >= weights["mobility_overdue_days"]:
            score += weights["mobility_overdue_bonus"]

    yesterday = history.get(day - timedelta(days=1))
    yesterday_pattern = pattern_of(yesterday, day_labels=day_labels) if yesterday else None
    day_label_set = day_labels if day_labels is not None else DEFAULT_DAY_LABELS
    if yesterday_pattern and pattern in day_label_set and yesterday_pattern == pattern:
        score -= weights["same_pattern_penalty"]

    if candidate == "pickleball":
        since_pickleball = days_since(history, day, "pickleball", day_labels=day_labels)
        if since_pickleball < weights["pickleball_min_days_since"]:
            return None
        if readiness is not None and readiness < weights["pickleball_min_readiness"]:
            return None
        if _is_pickleball_weather_blocked(location):
            return None

    if candidate == "run" and yesterday and pattern_of(yesterday, day_labels=day_labels) == "pickleball":
        score += weights["run_after_pickleball_bonus"]

    return score


def recommend(day, history, readiness, day_labels=None, location=None):
    scored = []
    for candidate in CANDIDATES:
        s = score_candidate(candidate, day, history, readiness, day_labels=day_labels, location=location)
        if s is not None:
            scored.append((candidate, s))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:2]


def gate_today(day, history, readiness, pains=None, location=None, day_labels=None):
    """Wraps recommend() to decide the full list of session_type blocks that
    belong in today's program -- a day can legitimately gate more than one
    block (e.g. a pickleball day always brackets with a 5-minute ankle
    warmup, CLAUDE.md's "single highest-leverage injury-prevention habit").

    recommend()'s own contract (top2 scored pairs, used by rationale.py for
    the score-breakdown/"why" text) is unchanged -- this function is purely
    additive: it derives the gated block list from recommend()'s top pick
    without altering how that pick was scored.

    `pains` is accepted for interface stability with the v2 design spec's
    signature (`gate_today(..., pains, weather_bad)`) but not used to change
    gating decisions in this phase -- pain-aware exercise *selection* within
    a block is program_builder.py's job, not the deterministic gate's.
    """
    top2 = recommend(day, history, readiness, day_labels=day_labels, location=location)
    if not top2:
        return []
    top_pick = top2[0][0]
    blocks = [top_pick]
    if top_pick == "pickleball":
        blocks.append("mobility")
    return blocks
