from datetime import timedelta

from scoring import WEIGHTS, days_since, pattern_of

_SIGNAL_LABELS = {
    "rest": "your rest day was overdue",
    "mobility": "a mobility session was overdue",
    "lower_a": "today follows a different movement pattern than yesterday",
    "lower_b": "today follows a different movement pattern than yesterday",
    "upper_a": "today follows a different movement pattern than yesterday",
    "upper_b": "today follows a different movement pattern than yesterday",
    "pickleball": "you're recovered and clear to play",
    "run": "an easy aerobic day fits well here",
}


def build_breakdown(today, history, readiness, top2):
    """Build the score_breakdown dict written to recommendations.score_breakdown
    and consumed by the rationale builders below."""
    yesterday_entry = history.get(today - timedelta(days=1))
    return {
        "readiness": readiness,
        "candidates": [{"type": c, "score": s} for c, s in top2],
        "signals": {
            "days_since_rest": days_since(history, today, "rest"),
            "days_since_mobility": days_since(history, today, "mobility"),
            "days_since_pickleball": days_since(history, today, "pickleball"),
            "yesterday_pattern": pattern_of(yesterday_entry) if yesterday_entry else None,
        },
    }


def build_internal_rationale(breakdown):
    """Debugging-friendly rationale: includes raw readiness score and exact
    days-since counts. Written to recommendations.internal_rationale, which
    has no anon/authenticated read policy (service-role only)."""
    candidates = breakdown["candidates"]
    signals = breakdown["signals"]
    readiness = breakdown["readiness"]

    if not candidates:
        return "No candidates survived scoring today (unexpected empty result)."

    top_type, top_score = candidates[0]["type"], candidates[0]["score"]
    lines = [f"Top pick: {top_type} (score {top_score:.1f})."]

    if readiness is not None:
        lines.append(f"Readiness {readiness}/10.")
        if readiness <= WEIGHTS["readiness_gate_threshold"]:
            lines.append(
                f"Readiness gate fired (<= {WEIGHTS['readiness_gate_threshold']}): "
                "non-rest/mobility candidates were excluded."
            )
    else:
        lines.append("No readiness reading available for today.")

    if top_type == "rest" and signals["days_since_rest"] >= WEIGHTS["rest_overdue_days"]:
        lines.append(
            f"Rest overdue bonus applied: {signals['days_since_rest']} days since last rest "
            f"(threshold {WEIGHTS['rest_overdue_days']})."
        )
    if top_type == "mobility" and signals["days_since_mobility"] >= WEIGHTS["mobility_overdue_days"]:
        lines.append(
            f"Mobility overdue bonus applied: {signals['days_since_mobility']} days since last "
            f"mobility session (threshold {WEIGHTS['mobility_overdue_days']})."
        )
    if signals["yesterday_pattern"] and pattern_of(top_type) == signals["yesterday_pattern"]:
        lines.append(
            f"Note: same pattern ({signals['yesterday_pattern']}) as yesterday -- "
            f"penalty of {WEIGHTS['same_pattern_penalty']} was already applied to this score."
        )

    if len(candidates) > 1:
        runner_up_type, runner_up_score = candidates[1]["type"], candidates[1]["score"]
        lines.append(f"Runner-up: {runner_up_type} (score {runner_up_score:.1f}).")

    return " ".join(lines)


def build_public_rationale(breakdown):
    """Friendly, biometric-free rationale: names the pick and a reason
    category, never a raw readiness score or exact day count. Written to
    recommendations.public_rationale, exposed via the recommendations_public
    view to anon/authenticated readers."""
    candidates = breakdown["candidates"]
    signals = breakdown["signals"]
    readiness = breakdown["readiness"]

    if not candidates:
        return "No recommendation could be generated today."

    top_type = candidates[0]["type"]
    reason = _SIGNAL_LABELS.get(top_type, "this keeps your training balanced this week")

    if readiness is not None and readiness <= WEIGHTS["readiness_gate_threshold"]:
        reason = "your recovery signals were low today, so the priority is rest/mobility"
    elif signals["yesterday_pattern"] and pattern_of(top_type) == signals["yesterday_pattern"]:
        reason = "today follows a different movement pattern than yesterday"

    pretty_name = top_type.replace("_", " ")
    sentence = f"Today's pick is {pretty_name} -- {reason}."

    if len(candidates) > 1:
        runner_up_pretty = candidates[1]["type"].replace("_", " ")
        sentence += f" Runner-up: {runner_up_pretty}."

    return sentence
