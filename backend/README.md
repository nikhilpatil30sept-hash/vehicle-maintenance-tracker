# CarKeeper backend

Flask + SQLAlchemy + PostgreSQL API. See the root `README.md` for the full
project overview and `../dev.sh` for running the whole stack locally.

## Running the tests

    cd backend
    venv/bin/pip install -r requirements-dev.txt   # once, or after requirements.txt changes
    venv/bin/pytest

This runs the full suite with coverage (configured in `pytest.ini` /
`.coveragerc`). Tests never touch the real database configured in `.env`:
`tests/conftest.py` points the app at a throwaway SQLite file created fresh
for the test session, and the schema is dropped and recreated before every
individual test so tests can't see each other's data.

Run a single file or test while iterating:

    venv/bin/pytest tests/test_records.py -v
    venv/bin/pytest tests/test_records.py -k mileage -v

`tests/test_ocr.py` mocks the Gemini HTTP call - no real `GEMINI_API_KEY` or
network access is needed to run the suite, and no receipt image or API quota
is ever touched by a test.

## Linting

    venv/bin/ruff check .          # report issues
    venv/bin/ruff check . --fix    # auto-fix what's safe to fix (import order, etc.)

Rule selection and line length live in `pyproject.toml` - a deliberately
curated set rather than Ruff's own defaults, so upgrading Ruff later can't
silently make CI stricter. This is a separate, required CI check (`Backend
lint (Ruff)`) from the pytest suite above.
