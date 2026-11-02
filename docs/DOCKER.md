# Running CarKeeper with Docker

Docker Compose runs the whole stack (PostgreSQL, the Flask API and the React site) with one command, and runs every test suite as a container. The same commands work on a laptop and in GitHub Actions (`.github/workflows/docker.yml`).

You only need Docker. No Python, Node.js or PostgreSQL install.

## Run the app

```bash
docker compose up --build
```

Then open http://localhost:3000. The API is on http://localhost:5001 (`/health` returns `{"status": "ok"}`).

Receipt scanning needs a Gemini key. Everything else works without one:

```bash
GEMINI_API_KEY=your-key docker compose up --build
```

Stop with Ctrl+C. `docker compose down -v` also deletes the database volume.

## Run the tests

| Suite | Command | What it needs |
|---|---|---|
| Backend unit tests (pytest) | `docker compose run --rm backend-unit-tests` | Nothing: a throwaway SQLite file |
| Integration tests | `docker compose run --rm integration-tests` | Starts `db` and `api` itself, then makes real HTTP calls |
| Frontend unit tests (Jest) | `docker compose run --rm frontend-unit-tests` | Nothing |
| End-to-end tests (Playwright) | `docker compose run --rm e2e-tests` | Nothing: the specs stub the API; report in `frontend/playwright-report/html/` |

## What runs where

| Service | Image | Notes |
|---|---|---|
| `db` | `postgres:16-alpine` | Data kept in the `pgdata` volume. Health check: `pg_isready` |
| `api` | `backend/Dockerfile`, target `runtime` | gunicorn with 2 workers on port 5001, as a non-root user. Health check: `/health` |
| `web` | `frontend/Dockerfile`, target `web` | Production React build served by nginx, published on port 3000 |
| `backend-unit-tests`, `integration-tests` | `backend/Dockerfile`, target `test` | Runtime image plus pytest and the other dev dependencies |
| `frontend-unit-tests` | `frontend/Dockerfile`, target `deps` | node_modules and source, no build |
| `e2e-tests` | `frontend/Dockerfile`, target `e2e` | Microsoft's Playwright image, browsers preinstalled |

Test services sit behind Compose profiles, so `docker compose up` starts only the app. Naming one with `docker compose run` starts it (and anything it depends on).

## Design decisions

- **Start order comes from health checks, not sleeps.** `api` waits for Postgres to pass `pg_isready`, `web` and `integration-tests` wait for `/health`, and CI uses `docker compose up --wait`.
- **The schema is created before gunicorn forks.** `app.py` runs `db.create_all()` on import. Two workers importing it at once race on `CREATE TABLE`, so the container imports the app once in a single process first. The CI jobs already use the same fix.
- **The API address is a build argument.** Create React App bakes `REACT_APP_*` values into the JavaScript at build time. The browser calls the API from the host, so the value is `http://localhost:5001`, not the Compose name `api`. Host port 3000 keeps the origin the API's CORS list already allows.
- **Dependencies are installed before the code is copied.** A code change rebuilds only the last layer instead of reinstalling every package.
- **One Dockerfile per app, several targets.** The test images build on the runtime image, so tests run against the same Python version and packages that serve real traffic.
- **The Playwright image version matches `package-lock.json`.** Bump `mcr.microsoft.com/playwright:vX.Y.Z-noble` in `frontend/Dockerfile` whenever `@playwright/test` is upgraded.
- **Secrets aren't baked in.** `.env` files are excluded by `.dockerignore`, and `SECRET_KEY` and `GEMINI_API_KEY` come from the environment. The defaults in `docker-compose.yml` are for local use only.
