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
