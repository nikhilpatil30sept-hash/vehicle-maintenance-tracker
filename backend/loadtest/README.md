# Load testing (k6)

Runs in CI as the **"Load test (k6)"** job, against a disposable Flask +
Postgres instance spun up in that job - never against the live Render
deployment. This is deliberately **not** a required branch-protection
check: performance thresholds are noisier than correctness tests, and a
shared CI runner's performance varies run to run, so blocking merges on it
would cause false alarms. It still runs on every push so it stays visible.

## What it covers

- `register` - repeated `/register` calls with a unique email each time.
  This is the main target: `generate_password_hash` is the real CPU cost
  in the request, and this is the only way to stress it repeatedly (see
  the rate-limit note below).
- `loginSample` - a **fixed, tiny** number of `/login` calls.
- `read` - `/vehicles` and `/summary` against a pre-created shared account.
- `write` - `/records` creation against a pre-created shared vehicle.
- `ocr` - `/api/ocr` against a mocked Gemini backend (`mock_gemini_server.py`),
  so it never touches a real API key, network call, or quota.

## Why /login gets almost no traffic

`/login` is rate-limited to 10 attempts / 5 minutes **per source IP**
(`LOGIN_MAX_ATTEMPTS` in `app.py`). Every k6 VU in this test shares one IP
(the CI runner), so hammering `/login` the way the other scenarios hammer
their endpoints would just measure the rate limiter kicking in, not login
latency. `loginSample` makes exactly 4 calls (plus 1 in `setup()` = 5
total), safely under the cap, and `register` carries the concurrency load
instead since it has no such limit.

## Why Postgres, not the SQLite the pytest suite uses

Write-path concurrency behaves very differently under SQLite's file
locking than under Postgres, and Postgres is what the app actually runs on
in production - a load test on SQLite would mostly be measuring SQLite.

## Why the database schema is created before gunicorn starts

`app.py` runs `db.create_all()` at import time, and gunicorn's workers all
import it at roughly the same moment. That races two workers into trying
to create the same table simultaneously - one of them crashes with "table
already exists". The CI job runs `python -c "import app"` once, single
process, before starting gunicorn, so every table already exists by the
time any worker boots.

## Running it locally

Needs a Postgres instance and downloading the k6 binary (not installed by
`requirements-dev.txt` - it's a standalone Go binary, not a Python
package: see https://k6.io/docs/get-started/installation/).

    cd backend
    python loadtest/mock_gemini_server.py &

    DATABASE_URL=postgresql://user:pass@localhost:5432/carkeeper_loadtest \
    SECRET_KEY=loadtest-secret \
    GEMINI_API_KEY=loadtest-fake-key \
    GEMINI_API_BASE=http://127.0.0.1:8090 \
    FLASK_ENV=production \
    venv/bin/python -c "import app"

    DATABASE_URL=postgresql://user:pass@localhost:5432/carkeeper_loadtest \
    SECRET_KEY=loadtest-secret \
    GEMINI_API_KEY=loadtest-fake-key \
    GEMINI_API_BASE=http://127.0.0.1:8090 \
    FLASK_ENV=production \
    venv/bin/gunicorn -w 4 -b 0.0.0.0:5001 app:app &

    BASE_URL=http://127.0.0.1:5001 k6 run loadtest/script.js
