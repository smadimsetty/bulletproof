import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from exercise_catalog_repo import load_catalog_excerpt

PROFILE = {
    "current_goals": ["total_body_resilience"],
    "pains": [{"body_part": "ankles", "severity": 5, "note": "x", "since": None}],
}

STRENGTH_ROWS = [
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
]

MOBILITY_ROWS = [
    {
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Banded Ankle Distraction",
        "movement_pattern": "mobility",
        "exercise_type": "mobility_stretch",
        "target_goals": ["mobility_flexibility", "total_body_resilience"],
        "body_parts": ["ankles"],
        "default_sets": None,
        "default_rep_range": "60-90s hold",
        "unilateral": True,
        "is_corrective": True,
    },
]


def test_load_catalog_excerpt_queries_per_block_type():
    with patch("exercise_catalog_repo.supabase_client.get") as mock_get:
        mock_get.side_effect = [STRENGTH_ROWS, MOBILITY_ROWS]
        excerpt = load_catalog_excerpt(["lower", "mobility"], PROFILE)

    assert mock_get.call_count == 2
    assert excerpt["lower"][0]["name"] == "ATG Split Squat"
    assert excerpt["mobility"][0]["name"] == "Banded Ankle Distraction"


def test_load_catalog_excerpt_filters_by_movement_pattern_for_strength_blocks():
    with patch("exercise_catalog_repo.supabase_client.get") as mock_get:
        mock_get.return_value = STRENGTH_ROWS
        load_catalog_excerpt(["lower"], PROFILE)

    params = mock_get.call_args[0][1]
    assert "movement_pattern" in params
    assert "squat" in params["movement_pattern"] or "in.(" in params["movement_pattern"]


def test_load_catalog_excerpt_orders_corrective_first():
    rows = [
        {**STRENGTH_ROWS[0], "id": "a", "is_corrective": False},
        {**STRENGTH_ROWS[0], "id": "b", "is_corrective": True},
    ]
    with patch("exercise_catalog_repo.supabase_client.get", return_value=rows):
        excerpt = load_catalog_excerpt(["lower"], PROFILE)

    assert excerpt["lower"][0]["id"] == "b"  # corrective row sorted first


def test_load_catalog_excerpt_caps_rows_per_block():
    many_rows = [{**STRENGTH_ROWS[0], "id": str(i)} for i in range(60)]
    with patch("exercise_catalog_repo.supabase_client.get", return_value=many_rows):
        excerpt = load_catalog_excerpt(["lower"], PROFILE, limit_per_block=40)

    assert len(excerpt["lower"]) == 40


def test_load_catalog_excerpt_returns_empty_list_for_block_with_no_matches():
    with patch("exercise_catalog_repo.supabase_client.get", return_value=[]):
        excerpt = load_catalog_excerpt(["run"], PROFILE)

    assert excerpt["run"] == []
