from report import FREE_LIMITS, build_report, status_for

SAMPLE = {
    "db_bytes": 18_582_675, "storage_bytes": 62_084, "storage_files": 1,
    "users_total": 1, "users_new_7d": 0, "active_7d": 1, "active_30d": 1,
    "workouts_7d": 2, "sets_7d": 34, "active_sprints": 1, "coach_calls_7d": 0,
    "largest_tables": [{"name": "activity", "bytes": 753_664}],
}


def test_status_thresholds():
    assert status_for(0.10) == "ok"
    assert status_for(0.50) == "watch"
    assert status_for(0.80) == "upgrade soon"


def test_report_shows_percent_of_each_free_limit():
    subject, html, text = build_report(SAMPLE)
    assert "18.6 MB" in text and "3.7%" in text  # 18.6 MB of 500 MB
    assert "MoveMaxx" in subject and "all clear" in subject.lower()
    assert "<table" in html and "activity" in html


def test_subject_flags_the_worst_limit():
    big = dict(SAMPLE, db_bytes=int(FREE_LIMITS["db_bytes"] * 0.85))
    subject, _, text = build_report(big)
    assert "upgrade soon" in subject.lower() and "Database" in subject
    assert "85.0%" in text


def test_missing_numbers_do_not_crash():
    subject, html, text = build_report({})
    assert "0 B" in text
