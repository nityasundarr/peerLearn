"""Top-level pytest configuration.

IMPORTANT: os.environ must be populated before any `from app.xxx import ...`
runs, because Settings() is instantiated at module level in config.py.
This file is the first thing pytest loads, so setting env vars here is safe.
"""

import os

# ---------------------------------------------------------------------------
# Fake credentials for unit tests — no real Supabase connection is made
# (the client is not queried in Phase 0 unit tests).
# ---------------------------------------------------------------------------
os.environ.setdefault("SUPABASE_URL", "https://fake-project.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "fake-anon-key-for-tests")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key-for-tests")
os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-do-not-use-in-production")

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------
import pytest
from fastapi.testclient import TestClient

# main.py is importable because pytest.ini sets pythonpath = .
from main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Synchronous HTTPX-backed TestClient for the FastAPI app.

    Used by health-check and future integration tests.
    scope="session" keeps one client alive for the full test run.
    """
    with TestClient(app) as c:
        yield c
