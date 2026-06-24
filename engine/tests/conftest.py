import os

import pytest


@pytest.fixture(autouse=True)
def engine_owner_id_env(monkeypatch):
    """ENGINE_OWNER_ID is required by recovery_repo/run_daily to populate the
    owner_id column on every write (see those modules' docstrings) -- tests
    need a value present regardless of the real .env file."""
    monkeypatch.setenv("ENGINE_OWNER_ID", "00000000-0000-0000-0000-000000000000")
