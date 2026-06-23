import os
import sys
from datetime import date
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from recovery_repo import pull_and_upsert_today, to_recovery_row


def test_to_recovery_row_rescales_readiness_score_to_1_10():
    readiness_rec = {"day": "2026-06-22", "score": 87}
    sleep_by_day = {}
    row = to_recovery_row(readiness_rec, sleep_by_day)
    assert row["date"] == "2026-06-22"
    assert row["source"] == "oura"
    assert row["subjective_readiness"] == 9  # round(87/10) = 9


def test_to_recovery_row_fills_sleep_fields_when_present():
    readiness_rec = {"day": "2026-06-22", "score": 70}
    sleep_by_day = {
        "2026-06-22": {
            "total_sleep_duration": 25200,
            "average_hrv": 55.0,
            "lowest_heart_rate": 48,
        }
    }
    row = to_recovery_row(readiness_rec, sleep_by_day)
    assert row["sleep_hrs"] == 7.0
    assert row["hrv"] == 55.0
    assert row["resting_hr"] == 48


def test_to_recovery_row_nulls_sleep_fields_when_absent():
    readiness_rec = {"day": "2026-06-22", "score": 70}
    row = to_recovery_row(readiness_rec, {})
    assert row["sleep_hrs"] is None
    assert row["hrv"] is None
    assert row["resting_hr"] is None


def test_pull_and_upsert_today_returns_readiness_and_upserts_row():
    fake_readiness = [{"day": "2026-06-22", "score": 65}]
    fake_sleep = [
        {
            "day": "2026-06-22",
            "type": "long_sleep",
            "total_sleep_duration": 27000,
            "average_hrv": 60.0,
            "lowest_heart_rate": 50,
        }
    ]
    with patch("recovery_repo.oura_client.fetch") as mock_fetch, patch(
        "recovery_repo.supabase_client.upsert"
    ) as mock_upsert:
        mock_fetch.side_effect = [fake_readiness, fake_sleep]
        readiness = pull_and_upsert_today(date(2026, 6, 22))

    assert readiness == 6  # round(65/10) == 6 under Python's banker's rounding
    mock_upsert.assert_called_once()
    args, kwargs = mock_upsert.call_args
    assert args[0] == "recovery"
    assert args[1][0]["date"] == "2026-06-22"
    assert kwargs["conflict_column"] == "date"


def test_pull_and_upsert_today_returns_none_when_oura_has_no_data_yet():
    with patch("recovery_repo.oura_client.fetch", return_value=[]), patch(
        "recovery_repo.supabase_client.upsert"
    ) as mock_upsert:
        readiness = pull_and_upsert_today(date(2026, 6, 22))

    assert readiness is None
    mock_upsert.assert_not_called()
