# CarKeeper API image. Two targets:
#   runtime - the Flask API under gunicorn, as it runs in production (default)
#   test    - runtime plus the test-only dependencies, for pytest in a container
# See docs/DOCKER.md.

# ---- runtime ----------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# The folder keeps the repo's name, "backend". Calling it /app breaks the tests:
# backend/ has an __init__.py, so a folder named app is itself an importable
# package "app", and pytest then imports it instead of app.py.
WORKDIR /srv/backend

# Dependencies first, code second: editing app.py then reuses this cached layer
# instead of reinstalling every package on each build.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Never run the app as root inside the container. The app folder is made writable
# too, so pytest can write its cache and coverage file in the test target.
RUN useradd --create-home --uid 10001 appuser && chown appuser:appuser /srv/backend
COPY --chown=appuser:appuser . .
USER 10001

EXPOSE 5001

# /health is the same unauthenticated readiness probe dev.sh waits on.
# python:slim ships without curl, so the check uses the standard library.
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=2).status == 200 else 1)"]

# Import the app once, in a single process, before gunicorn forks its workers.
# app.py runs db.create_all() at import time, and two workers doing that at the
# same moment race on CREATE TABLE - the same fix the CI jobs already use.
# exec makes gunicorn PID 1, so `docker stop` shuts it down cleanly.
CMD ["sh", "-c", "python -c 'import app' && exec gunicorn --workers 2 --bind 0.0.0.0:5001 --access-logfile - app:app"]

# ---- test -------------------------------------------------------------------
FROM runtime AS test

USER 0
RUN pip install -r requirements-dev.txt
USER 10001

# Test containers don't serve HTTP, so the API health check doesn't apply.
HEALTHCHECK NONE

# The unit tests point the app at a throwaway SQLite file (tests/conftest.py),
# so this needs no database. docker-compose.yml overrides the command for the
# integration tests, which run against the api container.
CMD ["pytest"]
