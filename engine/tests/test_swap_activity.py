import os
import sys
from datetime import date
from unittest.mock import call, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from swap_activity import _gated_blocks_for, main


def test_gated_blocks_for_pickleball_brackets_with_mobility():
    assert _gated_blocks_for("pickleball") == ["pickleball", "mobility"]


def test_gated_blocks_for_lower_has_no_bracketing():
    assert _gated_blocks_for("lower") == ["lower"]


def test_gated_blocks_for_rest_has_no_bracketing():
    assert _gated_blocks_for("rest") == ["rest"]


def test_main_rejects_invalid_activity_without_touching_program_builder_or_writes():
    with patch("swap_activity.env_loader.load_env"), \
         patch("swap_activity.program_builder.build_daily_program") as mock_build, \
         patch("swap_activity.supabase_client.upsert") as mock_upsert, \
         patch("swap_activity.supabase_client.insert") as mock_insert, \
         patch("swap_activity.supabase_client.delete") as mock_delete, \
         pytest.raises(SystemExit) as exc_info:
        main(["--date", "2026-07-05", "--activity", "tennis"])

    assert exc_info.value.code != 0
    mock_build.assert_not_called()
    mock_upsert.assert_not_called()
    mock_insert.assert_not_called()
    mock_delete.assert_not_called()


def test_main_rejects_unsupported_taxonomy_activity():
    """activity_taxonomy has entries (e.g. "yoga") that program_builder does
    not know how to build blocks for -- these must be rejected the same way
    as a completely made-up value."""
    with patch("swap_activity.env_loader.load_env"), \
         patch("swap_activity.program_builder.build_daily_program") as mock_build, \
         pytest.raises(SystemExit):
        main(["--date", "2026-07-05", "--activity", "yoga"])

    mock_build.assert_not_called()


def test_main_forces_top_pick_and_calls_delete_before_insert(monkeypatch):
    monkeypatch.setenv("ENGINE_OWNER_ID", "00000000-0000-0000-0000-000000000000")

    fake_profile = {"day_labels": ["upper", "lower"], "location": None, "pains": [], "current_goals": []}
    fake_program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [{"block_type": "lower", "title": "Lower", "estimated_minutes": 45, "exercises": []}],
        "internal_rationale": "internal", "public_rationale": "public",
    }
    existing_row = [{"id": "rec-id-123", "top_pick": "upper", "score_breakdown": {"readiness": 7}}]

    calls = []

    def record_delete(table, params):
        calls.append(call.delete(table, params))

    def record_insert(table, rows):
        calls.append(call.insert(table, rows))

    with patch("swap_activity.env_loader.load_env"), \
         patch("swap_activity.supabase_client.get", return_value=existing_row), \
         patch("swap_activity.sessions_repo.load_recent_history", return_value={}), \
         patch("swap_activity.profile_repo.load_profile", return_value=fake_profile), \
         patch("swap_activity.daily_feedback_repo.load_recent_feedback", return_value=[]), \
         patch("swap_activity.program_builder.build_daily_program", return_value=fake_program), \
         patch("swap_activity.supabase_client.upsert", return_value=[{"id": "rec-id-123"}]) as mock_upsert, \
         patch("swap_activity.supabase_client.delete", side_effect=record_delete) as mock_delete, \
         patch("swap_activity.supabase_client.insert", side_effect=record_insert) as mock_insert:
        main(["--date", "2026-07-05", "--activity", "lower"])

    # delete happened, and it happened before any insert
    mock_delete.assert_called_once_with(
        "recommendation_blocks", {"recommendation_id": "eq.rec-id-123"}
    )
    assert mock_insert.call_count >= 1
    delete_index = next(i for i, c in enumerate(calls) if c[0] == "delete")
    first_insert_index = next(i for i, c in enumerate(calls) if c[0] == "insert")
    assert delete_index < first_insert_index

    # the written recommendation row forces top_pick to the swapped activity
    written_row = mock_upsert.call_args[0][1][0]
    assert written_row["top_pick"] == "lower"
    assert written_row["score_breakdown"]["manual_swap"] is True
    assert written_row["score_breakdown"]["swapped_from"] == "upper"
    assert written_row["score_breakdown"]["readiness"] == 7


def test_main_swapped_from_is_none_when_no_existing_recommendation(monkeypatch):
    monkeypatch.setenv("ENGINE_OWNER_ID", "00000000-0000-0000-0000-000000000000")

    fake_profile = {"day_labels": ["upper", "lower"], "location": None, "pains": [], "current_goals": []}
    fake_program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [], "internal_rationale": "internal", "public_rationale": "public",
    }

    with patch("swap_activity.env_loader.load_env"), \
         patch("swap_activity.supabase_client.get", return_value=[]), \
         patch("swap_activity.sessions_repo.load_recent_history", return_value={}), \
         patch("swap_activity.profile_repo.load_profile", return_value=fake_profile), \
         patch("swap_activity.daily_feedback_repo.load_recent_feedback", return_value=[]), \
         patch("swap_activity.program_builder.build_daily_program", return_value=fake_program), \
         patch("swap_activity.supabase_client.upsert", return_value=[{"id": "rec-id-456"}]) as mock_upsert, \
         patch("swap_activity.supabase_client.delete") as mock_delete, \
         patch("swap_activity.supabase_client.insert"):
        main(["--date", "2026-07-05", "--activity", "rest"])

    written_row = mock_upsert.call_args[0][1][0]
    assert written_row["score_breakdown"]["swapped_from"] is None
    assert written_row["score_breakdown"]["readiness"] is None
    mock_delete.assert_called_once_with(
        "recommendation_blocks", {"recommendation_id": "eq.rec-id-456"}
    )


def test_main_pickleball_swap_builds_bracketed_program(monkeypatch):
    monkeypatch.setenv("ENGINE_OWNER_ID", "00000000-0000-0000-0000-000000000000")

    fake_profile = {"day_labels": ["upper", "lower"], "location": None, "pains": [], "current_goals": []}
    fake_program = {
        "program_generated_by": "fallback_template", "claude_model": None, "claude_usage": None,
        "blocks": [], "internal_rationale": "internal", "public_rationale": "public",
    }

    with patch("swap_activity.env_loader.load_env"), \
         patch("swap_activity.supabase_client.get", return_value=[]), \
         patch("swap_activity.sessions_repo.load_recent_history", return_value={}), \
         patch("swap_activity.profile_repo.load_profile", return_value=fake_profile), \
         patch("swap_activity.daily_feedback_repo.load_recent_feedback", return_value=[]), \
         patch("swap_activity.program_builder.build_daily_program", return_value=fake_program) as mock_build, \
         patch("swap_activity.supabase_client.upsert", return_value=[{"id": "rec-id-789"}]), \
         patch("swap_activity.supabase_client.delete"), \
         patch("swap_activity.supabase_client.insert"):
        main(["--date", "2026-07-05", "--activity", "pickleball"])

    args, kwargs = mock_build.call_args
    gated_blocks_arg = args[1]
    assert gated_blocks_arg == ["pickleball", "mobility"]
