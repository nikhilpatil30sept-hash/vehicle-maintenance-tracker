"""Import-time configuration guards.

app.py has no create_app() factory - it's a module-level Flask app that reads
its config and connects to the database the instant it's imported. That
means the "fail fast with an actionable message" checks at the top of the
file can only be exercised by actually importing it fresh, in a subprocess,
with a controlled environment: the module is already imported once per test
session by conftest.py's flask_app fixture, so re-importing it in-process
would just return the cached module and skip this code entirely.

Explicitly setting these to "" (rather than deleting them) matters: python-
dotenv's load_dotenv() never overrides a variable that's already present in
os.environ, even an empty one, so this reliably shadows whatever real
backend/.env has on disk instead of accidentally loading real credentials.
"""
import os
import subprocess
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run_import(env_overrides):
    env = os.environ.copy()
    env.update({"DATABASE_URL": "", "SECRET_KEY": "", "GEMINI_API_KEY": ""})
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", "import app"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )


def test_refuses_to_start_without_database_url():
    result = _run_import({"SECRET_KEY": "some-secret"})
    assert result.returncode != 0
    assert "DATABASE_URL is not set" in result.stderr


def test_refuses_to_start_without_secret_key():
    result = _run_import({"DATABASE_URL": "sqlite:////tmp/should-not-be-created.db"})
    assert result.returncode != 0
    assert "SECRET_KEY is not set" in result.stderr


def test_converts_legacy_postgres_scheme_before_the_not_set_check(tmp_path):
    # Render/Heroku-style URLs use "postgres://", which SQLAlchemy 1.4+
    # rejects outright. The app rewrites it to "postgresql://" first. There's
    # no real Postgres here, so this only proves it gets *past* that
    # rewrite and the "not set" guard - it still fails later, at actual
    # connection time, which is expected and fine.
    result = _run_import({
        "DATABASE_URL": "postgres://user:pass@localhost:59999/does_not_exist",
        "SECRET_KEY": "some-secret",
    })
    assert result.returncode != 0
    assert "DATABASE_URL is not set" not in result.stderr
