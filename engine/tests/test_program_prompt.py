import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from program_prompt import (
    SYSTEM_PROMPT,
    bucket_days_since,
    bucket_readiness,
    bucket_severity,
    render_catalog_excerpt,
    render_profile_slice,
    render_recent_signals,
)

# The five real names this is grounded on per design spec Decision 9 --
# never allowed verbatim anywhere in the system prompt, and asserted absent
# from generated public-facing text in Task 5's tests too.
GROUNDING_NAMES = [
    "Bryan Johnson",
    "Jeff Cavaliere",
    "Mike Mentzer",
    "Jeff Nippard",
    "Andrew Huberman",
]


def test_system_prompt_never_names_the_grounding_experts():
    lowered = SYSTEM_PROMPT.lower()
    for name in GROUNDING_NAMES:
        assert name.lower() not in lowered, f"system prompt must not name {name}"


def test_system_prompt_contains_explicit_no_naming_instruction():
    assert "never name" in SYSTEM_PROMPT.lower() or "do not name" in SYSTEM_PROMPT.lower()


def test_system_prompt_synthesizes_four_unattributed_stances():
    # Each stance's substance should appear even though no name does.
    lowered = SYSTEM_PROMPT.lower()
    assert "compound" in lowered  # hypertrophy/physique + evidence-based stance
    assert "corrective" in lowered or "rehab" in lowered  # physical-therapist stance
    assert "longevity" in lowered or "resilien" in lowered  # longevity-coach stance


def test_bucket_readiness_maps_1_to_10_scale_to_categorical_labels():
    assert bucket_readiness(1) == "very low"
    assert bucket_readiness(3) == "very low"
    assert bucket_readiness(4) == "low"
    assert bucket_readiness(5) == "low"
    assert bucket_readiness(6) == "moderate"
    assert bucket_readiness(7) == "moderate"
    assert bucket_readiness(8) == "good"
    assert bucket_readiness(9) == "good"
    assert bucket_readiness(10) == "excellent"
    assert bucket_readiness(None) == "unknown"


def test_bucket_severity_maps_1_to_10_scale_to_categorical_bands():
    assert bucket_severity(1) == "mild"
    assert bucket_severity(3) == "mild"
    assert bucket_severity(4) == "moderate"
    assert bucket_severity(6) == "moderate"
    assert bucket_severity(7) == "significant"
    assert bucket_severity(10) == "significant"


def test_bucket_days_since_returns_overdue_or_on_track():
    assert bucket_days_since(10, threshold=7) == "overdue"
    assert bucket_days_since(3, threshold=7) == "on track"
    assert bucket_days_since(999, threshold=7) == "overdue"


def test_render_profile_slice_never_includes_raw_readiness_or_severity_numbers():
    profile = {
        "current_goals": ["total_body_resilience"],
        "pains": [{"body_part": "ankles", "severity": 5, "note": "old injury", "since": None}],
        "day_labels": ["upper", "lower"],
    }
    text = render_profile_slice(profile)
    assert "5" not in text  # the raw severity number must not leak through
    assert "ankles" in text
    assert "moderate" in text  # bucketed band instead


def test_render_recent_signals_never_includes_raw_readiness_number():
    breakdown = {
        "readiness": 4,
        "candidates": [],
        "signals": {
            "days_since_rest": 8,
            "days_since_mobility": 2,
            "days_since_pickleball": 999,
            "yesterday_pattern": "upper",
        },
    }
    text = render_recent_signals(breakdown, recent_feedback=[])
    assert "4" not in text  # raw readiness score
    assert "8" not in text  # raw day count
    assert "low" in text  # bucketed readiness band


def test_render_recent_signals_includes_recent_feedback_text_verbatim():
    breakdown = {"readiness": 7, "candidates": [], "signals": {
        "days_since_rest": 1, "days_since_mobility": 1, "days_since_pickleball": 1, "yesterday_pattern": None,
    }}
    feedback = ["Right shoulder felt tight during warmup yesterday."]
    text = render_recent_signals(breakdown, recent_feedback=feedback)
    assert "Right shoulder felt tight during warmup yesterday." in text


def test_render_catalog_excerpt_renders_pipe_delimited_rows_with_ids():
    excerpt = {
        "lower": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "name": "ATG Split Squat",
                "movement_pattern": "squat",
                "body_parts": ["ankles", "knees"],
                "target_goals": ["total_body_resilience"],
                "default_sets": 3,
                "default_rep_range": "8-10",
                "unilateral": True,
                "is_corrective": False,
            }
        ]
    }
    text = render_catalog_excerpt(excerpt)
    assert "11111111-1111-1111-1111-111111111111" in text
    assert "ATG Split Squat" in text
    assert "lower" in text
