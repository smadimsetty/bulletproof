import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase_client import _headers


def test_headers_includes_service_role_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key-123")
    headers = _headers()
    assert headers["apikey"] == "test-key-123"
    assert headers["Authorization"] == "Bearer test-key-123"
    assert headers["Content-Type"] == "application/json"
