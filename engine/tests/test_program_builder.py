import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from program_builder import (
    _build_exercise_id_enum,
    _build_fallback_blocks,
    _validate_response,
    build_daily_program,
)

PROFILE = {
    "owner_id": "00000000-0000-0000-0000-000000000000",
    "current_goals": ["total_body_resilience"],
    "pains": [{"body_part": "ankles", "severity": 5, "note": "old injury", "since": None}],
    "day_labels": ["upper", "lower"],
    "location": {"lat": 40.7, "lon": -74.0},
}

BREAKDOWN = {
    "readiness": 7,
    "candidates": [("lower", 5.0), ("rest", 2.0)],
    "signals": {
        "days_since_rest": 3,
        "days_since_mobility": 1,
        "days_since_pickleball": 999,
        "yesterday_pattern": "upper",
    },
}

CATALOG_EXCERPT = {
    "lower": [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "ATG Split Squat",
            "movement_pattern": "squat",
            "exercise_type": "strength",
            "target_goals": ["total_body_resilience"],
            "body_parts": ["ankles", "knees", "hips"],
            "default_sets": 3,
            "default_rep_range": "8-10",
            "unilateral": True,
            "is_corrective": False,
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "name": "Nordic Hamstring Curl",
            "movement_pattern": "hinge",
            "exercise_type": "strength",
            "target_goals": ["total_body_resilience"],
            "body_parts": ["hamstrings"],
            "default_sets": 3,
            "default_rep_range": "6-8",
            "unilateral": False,
            "is_corrective": True,
        },
    ]
}


def test_build_exercise_id_enum_collects_every_id_across_blocks():
    ids = _build_exercise_id_enum(CATALOG_EXCERPT)
    assert ids == {"11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"}


def test_validate_response_accepts_known_exercise_ids():
    parsed = {
        "blocks": [
            {
                "block_type": "lower",
                "title": "Lower body",
                "estimated_minutes": 45,
                "exercises": [
                    {"exercise_id": "11111111-1111-1111-1111-111111111111", "sets": 3, "reps": "8-10",
                     "weight_note": None, "unilateral_left_first": True, "notes": "warm up the ankle first"},
                ],
            }
        ],
        "rationale_internal": "internal text",
        "rationale_public": "public text",
    }
    assert _validate_response(parsed, CATALOG_EXCERPT, ["lower"]) is True


def test_validate_response_rejects_unknown_exercise_id():
    parsed = {
        "blocks": [
            {
                "block_type": "lower",
                "title": "Lower body",
                "estimated_minutes": 45,
                "exercises": [
                    {"exercise_id": "99999999-9999-9999-9999-999999999999", "sets": 3, "reps": "8-10",
                     "weight_note": None, "unilateral_left_first": False, "notes": "x"},
                ],
            }
        ],
        "rationale_internal": "x",
        "rationale_public": "x",
    }
    assert _validate_response(parsed, CATALOG_EXCERPT, ["lower"]) is False


def test_validate_response_rejects_block_type_not_in_gated_blocks():
    parsed = {
        "blocks": [
            {"block_type": "upper", "title": "Upper body", "estimated_minutes": 45, "exercises": []},
        ],
        "rationale_internal": "x",
        "rationale_public": "x",
    }
    # gated_blocks said "lower", Claude returned "upper" -- must be rejected
    # even though "upper" has no exercises to fail the id check on its own.
    assert _validate_response(parsed, CATALOG_EXCERPT, ["lower"]) is False


def test_validate_response_rejects_missing_gated_block():
    parsed = {
        "blocks": [],
        "rationale_internal": "x",
        "rationale_public": "x",
    }
    assert _validate_response(parsed, CATALOG_EXCERPT, ["lower"]) is False


def test_validate_response_rejects_duplicate_block_type():
    parsed = {
        "blocks": [
            {"block_type": "lower", "title": "A", "estimated_minutes": 45, "exercises": []},
            {"block_type": "lower", "title": "B", "estimated_minutes": 45, "exercises": []},
        ],
        "rationale_internal": "x",
        "rationale_public": "x",
    }
    # Only one "lower" was gated -- two is a duplicate, not a valid response,
    # even though both individually pass the per-item block_type enum.
    assert _validate_response(parsed, CATALOG_EXCERPT, ["lower"]) is False


def test_build_fallback_blocks_uses_catalog_excerpt_deterministically():
    blocks = _build_fallback_blocks(["lower"], CATALOG_EXCERPT)
    assert len(blocks) == 1
    assert blocks[0]["block_type"] == "lower"
    # Nordic Hamstring Curl (is_corrective=True) should sort before ATG Split Squat.
    assert blocks[0]["exercises"][0]["exercise_id"] == "22222222-2222-2222-2222-222222222222"


def test_build_fallback_blocks_caps_at_4_strength_exercises():
    many = {
        "lower": [
            {**CATALOG_EXCERPT["lower"][0], "id": str(i), "is_corrective": False}
            for i in range(10)
        ]
    }
    blocks = _build_fallback_blocks(["lower"], many)
    assert len(blocks[0]["exercises"]) == 4


def test_build_fallback_blocks_caps_at_5_mobility_exercises():
    many = {
        "mobility": [
            {**CATALOG_EXCERPT["lower"][0], "id": str(i), "is_corrective": False}
            for i in range(10)
        ]
    }
    blocks = _build_fallback_blocks(["mobility"], many)
    assert len(blocks[0]["exercises"]) == 5


def test_build_daily_program_falls_back_on_claude_exception():
    with patch("program_builder.exercise_catalog_repo.load_catalog_excerpt", return_value=CATALOG_EXCERPT), \
         patch("program_builder._call_claude", side_effect=RuntimeError("API down")):
        result = build_daily_program(
            date(2026, 6, 22), ["lower"], PROFILE, BREAKDOWN, recent_feedback=[],
            owner_id="00000000-0000-0000-0000-000000000000",
        )

    assert result["program_generated_by"] == "fallback_template"
    assert result["claude_model"] is None
    assert result["claude_usage"] is None
    assert result["blocks"][0]["block_type"] == "lower"


def test_build_daily_program_falls_back_on_invalid_exercise_id():
    fake_parsed = {
        "blocks": [
            {"block_type": "lower", "title": "x", "estimated_minutes": 30, "exercises": [
                {"exercise_id": "00000000-0000-0000-0000-000000000099", "sets": 3, "reps": "8-10",
                 "weight_note": None, "unilateral_left_first": False, "notes": "x"},
            ]},
        ],
        "rationale_internal": "x", "rationale_public": "x",
    }
    fake_response = MagicMock()
    fake_response.parsed_output = fake_parsed
    fake_response.model = "claude-sonnet-4-6"
    fake_response.usage.input_tokens = 100
    fake_response.usage.output_tokens = 50
    fake_response.usage.cache_creation_input_tokens = 0
    fake_response.usage.cache_read_input_tokens = 0

    with patch("program_builder.exercise_catalog_repo.load_catalog_excerpt", return_value=CATALOG_EXCERPT), \
         patch("program_builder._call_claude", return_value=fake_response):
        result = build_daily_program(
            date(2026, 6, 22), ["lower"], PROFILE, BREAKDOWN, recent_feedback=[],
            owner_id="00000000-0000-0000-0000-000000000000",
        )

    assert result["program_generated_by"] == "fallback_template"


def test_build_daily_program_uses_claude_result_on_success():
    fake_parsed = {
        "blocks": [
            {"block_type": "lower", "title": "Lower body", "estimated_minutes": 45, "exercises": [
                {"exercise_id": "11111111-1111-1111-1111-111111111111", "sets": 3, "reps": "8-10",
                 "weight_note": None, "unilateral_left_first": True, "notes": "x"},
            ]},
        ],
        "rationale_internal": "internal", "rationale_public": "public",
    }
    fake_response = MagicMock()
    fake_response.parsed_output = fake_parsed
    fake_response.model = "claude-sonnet-4-6"
    fake_response.usage.input_tokens = 7000
    fake_response.usage.output_tokens = 800
    fake_response.usage.cache_creation_input_tokens = 6000
    fake_response.usage.cache_read_input_tokens = 0

    with patch("program_builder.exercise_catalog_repo.load_catalog_excerpt", return_value=CATALOG_EXCERPT), \
         patch("program_builder._call_claude", return_value=fake_response):
        result = build_daily_program(
            date(2026, 6, 22), ["lower"], PROFILE, BREAKDOWN, recent_feedback=[],
            owner_id="00000000-0000-0000-0000-000000000000",
        )

    assert result["program_generated_by"] == "claude"
    assert result["claude_model"] == "claude-sonnet-4-6"
    assert result["claude_usage"]["input_tokens"] == 7000
    assert result["blocks"][0]["exercises"][0]["exercise_id"] == "11111111-1111-1111-1111-111111111111"
    assert "Bryan Johnson" not in result["public_rationale"]


def test_build_daily_program_public_rationale_never_names_grounding_experts():
    fake_parsed = {
        "blocks": [], "rationale_internal": "internal",
        "rationale_public": "Today is a lower body day focused on resilience.",
    }
    fake_response = MagicMock()
    fake_response.parsed_output = fake_parsed
    fake_response.model = "claude-sonnet-4-6"
    fake_response.usage.input_tokens = 1
    fake_response.usage.output_tokens = 1
    fake_response.usage.cache_creation_input_tokens = 0
    fake_response.usage.cache_read_input_tokens = 0

    with patch("program_builder.exercise_catalog_repo.load_catalog_excerpt", return_value=CATALOG_EXCERPT), \
         patch("program_builder._call_claude", return_value=fake_response):
        result = build_daily_program(
            date(2026, 6, 22), ["lower"], PROFILE, BREAKDOWN, recent_feedback=[],
            owner_id="00000000-0000-0000-0000-000000000000",
        )

    for name in ["Bryan Johnson", "Jeff Cavaliere", "Mike Mentzer", "Jeff Nippard", "Andrew Huberman"]:
        assert name not in result["public_rationale"]
