import os
import sys
from datetime import date
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sessions_repo import load_recent_history


def test_load_recent_history_maps_date_strings_to_session_types():
    fake_rows = [
        {"date": "2026-06-20", "type": "upper_a"},
        {"date": "2026-06-21", "type": "rest"},
    ]
    with patch("sessions_repo.supabase_client.get", return_value=fake_rows) as mock_get:
        history = load_recent_history(date(2026, 6, 22), lookback_days=60)

    assert history == {
        date(2026, 6, 20): "upper_a",
        date(2026, 6, 21): "rest",
    }
    mock_get.assert_called_once()


def test_load_recent_history_queries_with_lookback_window():
    with patch("sessions_repo.supabase_client.get", return_value=[]) as mock_get:
        load_recent_history(date(2026, 6, 22), lookback_days=60)

    called_params = mock_get.call_args[0][1]
    assert called_params["select"] == "date,type"
    assert called_params["date"] == "gte.2026-04-23"


def test_load_recent_history_returns_empty_dict_when_no_rows():
    with patch("sessions_repo.supabase_client.get", return_value=[]):
        history = load_recent_history(date(2026, 6, 22), lookback_days=60)

    assert history == {}
