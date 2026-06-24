import json
import urllib.parse
import urllib.request

BASE_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes Open-Meteo returns in `current.weather_code`. 51-99
# covers drizzle, rain, freezing rain, snow, and thunderstorm -- the bad-
# weather-for-outdoor-pickleball band. 0-3 is clear/partly cloudy; the few
# codes in between (45/48 fog) are deliberately not flagged since fog alone
# doesn't stop pickleball.
BAD_WEATHER_CODES = range(51, 100)

# Looking 3 hours ahead (the first 3 entries of the hourly array, which
# Open-Meteo returns starting at the current hour) catches rain that's about
# to start even if it hasn't yet -- "imminently bad" per the design spec,
# not just "bad right now".
IMMINENT_HOURS = 3
IMMINENT_RAIN_PROBABILITY_THRESHOLD = 60


def is_bad_for_pickleball(lat, lon):
    """Returns True if it is currently raining/stormy/snowing at (lat, lon),
    or if rain is >IMMINENT_RAIN_PROBABILITY_THRESHOLD% likely in the next
    IMMINENT_HOURS hours. Raises urllib.error.URLError / ValueError /
    KeyError on network or parse failure -- callers (scoring.py) are
    responsible for catching and degrading open, per the v2 design spec's
    "if the weather API is down, don't block pickleball" decision. This
    function itself does not swallow errors, so it stays simple and its own
    failure-path tests stay clean.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "precipitation,weather_code",
        "hourly": "precipitation_probability",
        "forecast_days": 1,
    }
    url = BASE_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.load(resp)

    current = body["current"]
    if current["precipitation"] > 0:
        return True
    if current["weather_code"] in BAD_WEATHER_CODES:
        return True

    upcoming = body["hourly"]["precipitation_probability"][:IMMINENT_HOURS]
    if upcoming and max(upcoming) > IMMINENT_RAIN_PROBABILITY_THRESHOLD:
        return True

    return False
