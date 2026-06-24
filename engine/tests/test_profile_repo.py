import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from profile_repo import load_profile

FAKE_USER_PROFILE_ROW = {
    "owner_id": "00000000-0000-0000-0000-000000000000",
    "preferred_split": "upper_lower",
    "current_goals": ["total_body_resilience", "mobility_flexibility"],
    "pains": [
        {"body_part": "ankles", "severity": 5, "note": "old injury", "since": None},
        {"body_part": "neck", "severity": 3, "note": "chronic stiffness", "since": None},
    ],
    "activities": ["strength_training", "pickleball"],
    "location": {"lat": 40.7128, "lon": -74.006, "label": "NYC", "timezone": "America/New_York"},
}

FAKE_SPLIT_TAXONOMY_ROW = {"id": "upper_lower", "label": "Upper / Lower", "day_labels": ["upper", "lower"]}


def test_load_profile_combines_user_profile_and_split_taxonomy():
    with patch("profile_repo.supabase_client.get") as mock_get:
        mock_get.side_effect = [[FAKE_USER_PROFILE_ROW], [FAKE_SPLIT_TAXONOMY_ROW]]
        profile = load_profile("00000000-0000-0000-0000-000000000000")

    assert profile["preferred_split"] == "upper_lower"
    assert profile["day_labels"] == ["upper", "lower"]
    assert profile["current_goals"] == ["total_body_resilience", "mobility_flexibility"]
    assert profile["pains"][0]["body_part"] == "ankles"
    assert profile["location"]["lat"] == 40.7128


def test_load_profile_defaults_day_labels_when_no_preferred_split():
    row = dict(FAKE_USER_PROFILE_ROW, preferred_split=None)
    with patch("profile_repo.supabase_client.get") as mock_get:
        mock_get.side_effect = [[row]]
        profile = load_profile("00000000-0000-0000-0000-000000000000")

    assert profile["day_labels"] == ["upper", "lower"]
    assert mock_get.call_count == 1  # never queries split_taxonomy when preferred_split is null


def test_load_profile_handles_missing_pains_and_location():
    row = dict(FAKE_USER_PROFILE_ROW, pains=[], location=None)
    with patch("profile_repo.supabase_client.get") as mock_get:
        mock_get.side_effect = [[row], [FAKE_SPLIT_TAXONOMY_ROW]]
        profile = load_profile("00000000-0000-0000-0000-000000000000")

    assert profile["pains"] == []
    assert profile["location"] is None


def test_load_profile_raises_when_owner_has_no_profile_row():
    with patch("profile_repo.supabase_client.get", return_value=[]):
        try:
            load_profile("nonexistent-owner-id")
            assert False, "expected a lookup failure for a missing profile row"
        except (ValueError, IndexError):
            pass
