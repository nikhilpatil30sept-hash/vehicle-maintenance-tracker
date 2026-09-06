"""Shared pytest fixtures for the backend test suite.

app.py is a module-level Flask app (no create_app() factory): it reads
DATABASE_URL/SECRET_KEY/GEMINI_API_KEY and opens a database connection the
moment it is imported. That means tests must set safe, isolated environment
variables *before* the first `import app`, or they'd hit whatever real
database is configured in backend/.env.

python-dotenv's load_dotenv() (called inside app.py) never overrides
variables that are already set in os.environ, so setting them here first is
enough to keep the real .env from taking over.
"""
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


@pytest.fixture(scope="session")
def flask_app(tmp_path_factory):
    """Import app.py exactly once, wired to a throwaway SQLite file."""
    db_path = tmp_path_factory.mktemp("db") / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
    os.environ["GEMINI_API_KEY"] = "test-gemini-key"
    os.environ["FLASK_ENV"] = "testing"

    import app as app_module  # noqa: E402  (import must happen after env setup)

    app_module.app.config.update(TESTING=True)
    return app_module


@pytest.fixture(autouse=True)
def _clean_state(flask_app):
    """Reset the database schema and the in-process login rate-limiter before
    every test, so tests can't see each other's data or attempt counts."""
    with flask_app.app.app_context():
        flask_app.db.drop_all()
        flask_app.db.create_all()
    flask_app._login_attempts.clear()
    yield
    with flask_app.app.app_context():
        flask_app.db.session.remove()


@pytest.fixture
def client(flask_app):
    return flask_app.app.test_client()


@pytest.fixture
def register_and_login(client):
    """Create a user and return (auth_headers, user_dict).

    Call it more than once with different emails to get two distinct,
    independently-owned accounts for ownership/IDOR tests.
    """
    def _do(email="driver@example.com", password="supersecret1"):
        client.post("/register", json={"email": email, "password": password})
        resp = client.post("/login", json={"email": email, "password": password})
        body = resp.get_json()
        assert resp.status_code == 200, f"login fixture failed: {body}"
        return {"Authorization": f"Bearer {body['token']}"}, body["user"]
    return _do
