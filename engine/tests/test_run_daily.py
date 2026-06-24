import os
import sys
from datetime import date
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run_daily import build_block_exercise_rows, build_block_rows, build_recommendation_row


def test_build_recommendation_row_with_two_candidates():
    today = date(2026, 6, 22)
    top2 = [("lower", 5.0), ("rest", 2.0)]
    breakdown = {"readiness": 7, "candidates": [], "signals": {}}
    program = {
        "program_generated_by": "claude",
        "claude_model": "claude-sonnet-4-6",
        "claude_usage": {"input_tokens": 100, "output_tokens": 50,
                          "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0},
        "blocks": [],
        "internal_rationale": "internal text",
        "public_rationale": "public text",
    }
    row = build_recommendation_row(today, top2, breakdown, program)
    assert row == {
        "date": "2026-06-22",
        "top_pick": "lower",
        "runner_up": "rest",
        "score_breakdown": breakdown,
        "internal_rationale": "internal text",
        "public_rationale": "public text",
        "program_generated_by": "claude",
        "claude_model": "claude-sonnet-4-6",
        "claude_usage": program["claude_usage"],
        "owner_id": "00000000-0000-0000-0000-000000000000",
    }


def test_build_recommendation_row_with_only_one_candidate():
    today = date(2026, 6, 22)
    top2 = [("rest", 12.0)]
    breakdown = {"readiness": 2, "candidates": [], "signals": {}}
    program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [], "internal_rationale": "internal text", "public_rationale": "public text",
    }
    row = build_recommendation_row(today, top2, breakdown, program)
    assert row["top_pick"] == "rest"
    assert row["runner_up"] is None
    assert row["program_generated_by"] == "fallback_template"


def test_build_recommendation_row_raises_when_no_candidates_survive():
    today = date(2026, 6, 22)
    breakdown = {"readiness": None, "candidates": [], "signals": {}}
    program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [], "internal_rationale": "internal text", "public_rationale": "public text",
    }
    with pytest.raises(ValueError, match="no candidates"):
        build_recommendation_row(today, [], breakdown, program)


def test_build_block_rows_assigns_sequential_block_order():
    blocks = [
        {"block_type": "pickleball", "title": "Pickleball", "estimated_minutes": 90, "exercises": []},
        {"block_type": "mobility", "title": "Ankle warmup", "estimated_minutes": 5, "exercises": []},
    ]
    rows = build_block_rows("rec-id-123", blocks)
    assert len(rows) == 2
    assert rows[0]["block_order"] == 0
    assert rows[0]["recommendation_id"] == "rec-id-123"
    assert rows[0]["block_type"] == "pickleball"
    assert rows[1]["block_order"] == 1
    assert rows[1]["block_type"] == "mobility"


def test_build_block_rows_includes_split_day_label_when_present():
    blocks = [{"block_type": "lower", "title": "Lower body", "estimated_minutes": 45,
               "exercises": [], "split_day_label": "lower"}]
    rows = build_block_rows("rec-id-123", blocks)
    assert rows[0]["split_day_label"] == "lower"


def test_build_block_rows_defaults_split_day_label_to_none():
    blocks = [{"block_type": "rest", "title": "Rest", "estimated_minutes": None, "exercises": []}]
    rows = build_block_rows("rec-id-123", blocks)
    assert rows[0]["split_day_label"] is None


def test_build_block_exercise_rows_assigns_sequential_exercise_order():
    blocks = [
        {
            "block_type": "lower",
            "exercises": [
                {"exercise_id": "ex-1", "sets": 3, "reps": "8-10", "weight_note": None,
                 "unilateral_left_first": True, "notes": "x"},
                {"exercise_id": "ex-2", "sets": 3, "reps": "6-8", "weight_note": "bodyweight",
                 "unilateral_left_first": False, "notes": None},
            ],
        }
    ]
    block_ids = ["block-id-1"]
    rows = build_block_exercise_rows(block_ids, blocks)
    assert len(rows) == 2
    assert rows[0]["block_id"] == "block-id-1"
    assert rows[0]["exercise_id"] == "ex-1"
    assert rows[0]["exercise_order"] == 0
    assert rows[0]["is_unilateral_left_first"] is True
    assert rows[1]["exercise_order"] == 1
    assert rows[1]["prescribed_weight_note"] == "bodyweight"


def test_build_block_exercise_rows_handles_empty_exercises_list():
    blocks = [{"block_type": "rest", "exercises": []}]
    rows = build_block_exercise_rows(["block-id-1"], blocks)
    assert rows == []


def test_main_calls_gate_today_and_program_builder(monkeypatch):
    import run_daily

    monkeypatch.setenv("ENGINE_OWNER_ID", "00000000-0000-0000-0000-000000000000")

    fake_profile = {"day_labels": ["upper", "lower"], "location": None, "pains": [], "current_goals": []}
    fake_program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [{"block_type": "lower", "title": "Lower", "estimated_minutes": 45, "exercises": []}],
        "internal_rationale": "internal", "public_rationale": "public",
    }

    with patch("run_daily.env_loader.load_env"), \
         patch("run_daily.recovery_repo.pull_and_upsert_today", return_value=7), \
         patch("run_daily.sessions_repo.load_recent_history", return_value={}), \
         patch("run_daily.profile_repo.load_profile", return_value=fake_profile), \
         patch("run_daily.daily_feedback_repo.load_recent_feedback", return_value=[]), \
         patch("run_daily.scoring.gate_today", return_value=["lower"]) as mock_gate, \
         patch("run_daily.program_builder.build_daily_program", return_value=fake_program) as mock_build, \
         patch("run_daily.supabase_client.upsert", return_value=[{"id": "rec-id-123"}]) as mock_upsert, \
         patch("run_daily.supabase_client.get", return_value=[]), \
         patch("run_daily.supabase_client.insert") as mock_insert:
        run_daily.main()

    mock_gate.assert_called_once()
    mock_build.assert_called_once()
    assert mock_upsert.call_count == 1  # recommendations row
    assert mock_insert.call_count >= 1  # at least the recommendation_blocks insert
