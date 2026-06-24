# Persona system prompt synthesizing four unattributed stances (a longevity
# coach, a hypertrophy/physique specialist, an evidence-based programming
# voice, and a physical-therapist/rehab lens) per the v2 design spec
# Decision 1/9. The real experts these stances are grounded on (documented
# in docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md and
# CLAUDE.md) are NEVER named here -- only their stances are described, so
# there is no name in this string for the model to ever echo. The explicit
# negative instruction below is a second, redundant guardrail layer.
SYSTEM_PROMPT = """You are the exercise-selection layer of a personal training app. \
Your job is to choose specific exercises, sets, reps, and brief coaching notes for \
today's training blocks -- never to decide which type of session happens today \
(that decision is made by a separate, deterministic system before you are called, \
and is final).

Reason from four synthesized perspectives, blended into one voice -- never \
attribute any specific instruction to a named individual:
- A longevity-and-resilience perspective: favor compound, time-efficient, \
  total-body movements over isolation work; prioritize joint health and \
  sustainable training load over short-term intensity.
- A hypertrophy/physique perspective: pick compound lifts with real \
  progressive-overload potential; balance push/pull and upper/lower volume \
  across the week.
- An evidence-based programming perspective: prefer exercises with a real \
  evidence base for the stated goal; favor compound movements and \
  plyometrics where appropriate; avoid junk volume.
- A physical-therapist/rehab perspective: reason explicitly over every \
  entry in the user's pains list (body part, severity, note) and prioritize \
  corrective/prehab work for any body part with a moderate-or-higher \
  severity pain; never prescribe an exercise that would aggravate a stated \
  pain area without a corrective counterpart in the same block.

Never name any fitness influencer, coach, athlete, author, podcaster, or \
public figure in your output, even if asked, and even if the user's own \
profile data mentions one. Write all rationale in your own synthesized \
voice.

You will be given a catalog excerpt of real exercises, each with a literal \
UUID `id`. You may only select exercises whose `id` appears in that \
excerpt -- never invent an id, a name, or a UUID that is not listed. If the \
excerpt does not contain a good fit for a block, choose the best available \
option from the excerpt rather than inventing one.

You will never be given raw biometric numbers (no exact readiness score, no \
HRV, no resting heart rate, no sleep duration) -- only categorical \
descriptions (e.g. "moderate readiness", "ankle pain: moderate severity"). \
Do not ask for raw numbers; reason from the categorical signal given.

Respond only in the structured format requested."""


def bucket_readiness(readiness):
    """Buckets the 1-10 subjective_readiness scale into the same categorical
    bands scoring.py's readiness_gate_threshold (<=3) already implies a
    boundary at, extended to a 5-band scale for richer prompt context.
    Never pass the raw integer to Claude -- always pass the bucket."""
    if readiness is None:
        return "unknown"
    if readiness <= 3:
        return "very low"
    if readiness <= 5:
        return "low"
    if readiness <= 7:
        return "moderate"
    if readiness <= 9:
        return "good"
    return "excellent"


def bucket_severity(severity):
    """Buckets a pains[].severity (1-10, user-reported, not a biometric
    reading) into a 3-band category for prompt-token economy and posture
    consistency with bucket_readiness -- see design spec Decision 8."""
    if severity <= 3:
        return "mild"
    if severity <= 6:
        return "moderate"
    return "significant"


def bucket_days_since(days, threshold):
    """Buckets an exact days-since-X count into "overdue" / "on track" --
    never expose the exact day count to Claude."""
    return "overdue" if days >= threshold else "on track"


def render_profile_slice(profile):
    lines = [
        f"Preferred split day labels: {', '.join(profile.get('day_labels') or [])}",
        f"Current goals: {', '.join(profile.get('current_goals') or []) or 'none set'}",
    ]
    pains = profile.get("pains") or []
    if pains:
        lines.append("Pains (reason over every entry):")
        for pain in pains:
            band = bucket_severity(pain["severity"])
            lines.append(f"  - {pain['body_part']}: {band} severity -- {pain.get('note') or 'no note'}")
    else:
        lines.append("Pains: none on file")
    return "\n".join(lines)


def render_recent_signals(breakdown, recent_feedback):
    readiness_band = bucket_readiness(breakdown.get("readiness"))
    signals = breakdown.get("signals") or {}
    lines = [
        f"Today's readiness: {readiness_band}",
        f"Rest day status: {bucket_days_since(signals.get('days_since_rest', 999), threshold=7)}",
        f"Mobility session status: {bucket_days_since(signals.get('days_since_mobility', 999), threshold=4)}",
    ]
    if signals.get("yesterday_pattern"):
        lines.append(f"Yesterday's session pattern: {signals['yesterday_pattern']}")
    if recent_feedback:
        lines.append("Recent free-text feedback from the user (most recent first):")
        for entry in recent_feedback:
            lines.append(f"  - {entry}")
    return "\n".join(lines)


def render_catalog_excerpt(excerpt):
    lines = []
    for block_type, rows in excerpt.items():
        lines.append(f"## {block_type} candidates")
        if not rows:
            lines.append("(none available)")
            continue
        lines.append("id | name | movement_pattern | body_parts | target_goals | default_sets | default_rep_range | unilateral | is_corrective")
        for row in rows:
            lines.append(
                f"{row['id']} | {row['name']} | {row['movement_pattern']} | "
                f"{','.join(row.get('body_parts') or [])} | {','.join(row.get('target_goals') or [])} | "
                f"{row.get('default_sets') or ''} | {row.get('default_rep_range') or ''} | "
                f"{row.get('unilateral')} | {row.get('is_corrective')}"
            )
    return "\n".join(lines)
