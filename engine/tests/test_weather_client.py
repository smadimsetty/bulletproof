import os
import sys
import urllib.error
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from weather_client import is_bad_for_pickleball

GOOD_WEATHER_RESPONSE = {
    "current": {"precipitation": 0.0, "weather_code": 1},
    "hourly": {"precipitation_probability": [10, 15, 20, 25, 30, 5]},
}

RAINING_NOW_RESPONSE = {
    "current": {"precipitation": 2.5, "weather_code": 61},
    "hourly": {"precipitation_probability": [80, 80, 80, 80, 80, 80]},
}

CLEAR_BUT_IMMINENT_RAIN_RESPONSE = {
    "current": {"precipitation": 0.0, "weather_code": 2},
    "hourly": {"precipitation_probability": [70, 75, 80, 10, 10, 10]},
}

BAD_WEATHER_CODE_RESPONSE = {
    "current": {"precipitation": 0.0, "weather_code": 95},
    "hourly": {"precipitation_probability": [0, 0, 0, 0, 0, 0]},
}


def _mock_response(body):
    cm = MagicMock()
    cm.__enter__.return_value.read.return_value = __import__("json").dumps(body).encode("utf-8")
    return cm


def test_is_bad_for_pickleball_false_when_clear_and_dry():
    with patch("weather_client.urllib.request.urlopen", return_value=_mock_response(GOOD_WEATHER_RESPONSE)):
        assert is_bad_for_pickleball(40.7, -74.0) is False


def test_is_bad_for_pickleball_true_when_currently_raining():
    with patch("weather_client.urllib.request.urlopen", return_value=_mock_response(RAINING_NOW_RESPONSE)):
        assert is_bad_for_pickleball(40.7, -74.0) is True


def test_is_bad_for_pickleball_true_when_rain_imminent_in_next_3_hours():
    with patch("weather_client.urllib.request.urlopen", return_value=_mock_response(CLEAR_BUT_IMMINENT_RAIN_RESPONSE)):
        assert is_bad_for_pickleball(40.7, -74.0) is True


def test_is_bad_for_pickleball_true_when_weather_code_is_storm_or_snow():
    with patch("weather_client.urllib.request.urlopen", return_value=_mock_response(BAD_WEATHER_CODE_RESPONSE)):
        assert is_bad_for_pickleball(40.7, -74.0) is True


def test_is_bad_for_pickleball_builds_correct_request_url():
    captured = {}

    def fake_urlopen(req, *args, **kwargs):
        captured["url"] = req.full_url
        return _mock_response(GOOD_WEATHER_RESPONSE)

    with patch("weather_client.urllib.request.urlopen", side_effect=fake_urlopen):
        is_bad_for_pickleball(40.7128, -74.006)

    assert "api.open-meteo.com" in captured["url"]
    assert "latitude=40.7128" in captured["url"]
    assert "longitude=-74.006" in captured["url"]


def test_is_bad_for_pickleball_propagates_network_errors():
    with patch(
        "weather_client.urllib.request.urlopen",
        side_effect=urllib.error.URLError("network down"),
    ):
        try:
            is_bad_for_pickleball(40.7, -74.0)
            assert False, "expected URLError to propagate"
        except urllib.error.URLError:
            pass
