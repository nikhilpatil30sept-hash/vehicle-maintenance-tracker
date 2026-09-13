# Integration tests

`backend/tests/` uses Flask's `test_client()` - no real HTTP, no real
database engine. That's fast and fine for unit-level checks, but it means
nothing in the suite actually proves the deployed app answers requests
correctly, end to end.

`test_critical_path.py` does: it makes real HTTP calls (via `requests`)
against a fully booted instance of the app - gunicorn, real Postgres - and
walks the actual user journey: register, log in, add a vehicle, add a
service record, confirm the vehicle's mileage and the account's summary
reflect it, confirm another account can't touch it, then clean up.

## Running locally

You need a live server to point these at - they don't start one themselves.
The quickest way is SQLite (fine for exercising the HTTP layer; CI uses real
Postgres, see `.github/workflows/ci.yml`'s `integration-tests` job):

```bash
cd backend
source venv/bin/activate
DATABASE_URL="sqlite:////tmp/carkeeper_it.db" \
SECRET_KEY="local-secret" \
GEMINI_API_KEY="unused" \
FLASK_ENV="testing" \
python -c "import app; app.app.run(host='127.0.0.1', port=5056)" &

BASE_URL=http://127.0.0.1:5056 python -m pytest tests_integration/ -v --no-cov
```

`pytest.ini`'s `testpaths = tests` means the default `pytest` invocation
(used by the `backend-tests` job) never picks these up - they only run when
pointed at explicitly, since they need a live server that job doesn't boot.
