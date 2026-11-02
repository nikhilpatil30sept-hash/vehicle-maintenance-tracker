# CarKeeper API tests (Java)

Black-box tests for the CarKeeper REST API, written in Java 21 with **JUnit 5** and **REST Assured**. They run against a live API (in CI, the Docker Compose stack: the Flask API under gunicorn plus PostgreSQL) over real HTTP. Nothing is mocked.

## Run them

With Docker only (no local Java or Maven needed):

```bash
docker compose up -d --wait db api
docker compose run --rm java-api-tests
```

With a local JDK 21 and Maven, against an API already running on port 5001:

```bash
cd api-tests-java
mvn test                                   # defaults: http://localhost:5001
mvn test -DbaseUrl=http://localhost:5001 -DjwtSecret=<the API's SECRET_KEY>
```

CI: `.github/workflows/java-api-tests.yml` starts Postgres and the API, runs the suite in a Maven container, and keeps the Surefire reports as an artifact.

## What's covered

| Class | What it checks |
|---|---|
| `HealthTest` | `/health` is public and returns JSON |
| `HttpErrorsTest` | Unknown routes return 404 and wrong methods return 405, not 500 |
| `AuthTest` | Registration and login: email normalisation, duplicates, email and password rules, non-object bodies, and identical messages for "wrong password" and "no such account" |
| `AuthGuardTest` | All 10 protected endpoints refuse requests without a token, plus non-Bearer, malformed, wrong-key and expired tokens. A self-signed token with the right key is the positive control |
| `VehicleTest` | Create (checked against a JSON Schema), trimming and `"12,345"` mileage parsing, 9 field-validation cases, partial update, delete, list order |
| `RecordTest` | Defaults, `"$1,234.50"` cost parsing, odometer only moving forward and being recomputed after an edit, newest-first order, 8 validation cases, query-string ids, delete, cascade on vehicle delete |
| `OwnershipTest` | A second user can't list, add to, update or delete the first user's vehicle or records (404, not 403, so ids aren't confirmed), and the owner's data is unchanged afterwards |
| `SummaryTest` | Vehicle count and total cost for a fresh user, before and after adding data |
| `OcrTest` | Receipt scanning returns 503 when the server has no Gemini key |

Response bodies are validated against JSON Schemas in `src/test/resources/schemas/`.

## Design decisions

- **Real accounts, few logins.** The API allows 10 login attempts per client address every 5 minutes. Tests share two accounts (`Accounts.primary()` and `Accounts.other()`), so a full run makes about 6 logins.
- **Unique data per run.** Emails carry a random suffix and every test creates its own vehicles, so runs don't depend on each other or on what's already in the database.
- **Tokens signed in the test.** `Jwt` signs HS256 tokens with the JDK, so the suite can send expired tokens and tokens signed with the wrong key. A token signed with the right key must work, which proves the other two fail for the reason the test claims.
- **Exact messages where they are the contract.** Validation tests assert the field name and the start of the message, so a range bound that changes every year (the maximum model year) doesn't break them.
