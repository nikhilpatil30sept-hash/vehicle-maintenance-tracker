"""The app's global error handlers, and _json_body's edge cases.

These deliberately provoke failures (oversized bodies, broken DB calls,
malformed JSON shapes) to prove the app degrades safely - a client-facing
message and the right status code, never a leaked stack trace or a wrong
status.
"""
from sqlalchemy.exc import SQLAlchemyError


def test_oversized_request_body_is_rejected_with_413(client):
    # Comfortably over app.config['MAX_CONTENT_LENGTH'] (10 MB).
    huge_password = "a" * (11 * 1024 * 1024)
    resp = client.post("/register", json={"email": "big@example.com", "password": huge_password})
    assert resp.status_code == 413
    assert resp.get_json() == {"error": "Upload is too large"}


def test_database_errors_return_a_generic_500_without_leaking_details(client, register_and_login, flask_app):
    headers, _ = register_and_login()
    # Simulate the table itself being unavailable (e.g. a botched migration),
    # which raises a SQLAlchemyError deep inside the query - not something the
    # route code catches itself.
    with flask_app.app.app_context():
        flask_app.Vehicle.__table__.drop(flask_app.db.engine)
    try:
        resp = client.get("/vehicles", headers=headers)
        assert resp.status_code == 500
        assert resp.get_json() == {"error": "A database error occurred"}
    finally:
        with flask_app.app.app_context():
            flask_app.Vehicle.__table__.create(flask_app.db.engine)


def test_unexpected_errors_return_a_generic_500(client, register_and_login, flask_app, monkeypatch):
    headers, _ = register_and_login()

    def boom():
        raise RuntimeError("simulated crash unrelated to the database")

    monkeypatch.setattr(flask_app.db.session, "commit", boom)
    resp = client.post(
        "/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 0},
        headers=headers,
    )
    assert resp.status_code == 500
    assert resp.get_json() == {"error": "An unexpected error occurred"}


def test_register_returns_400_not_500_when_commit_unexpectedly_fails(client, flask_app, monkeypatch):
    # Distinct from the generic 500 handler above: register() wraps its own
    # commit in a local try/except (this is meant to catch a duplicate-email
    # race that slips past the pre-check), so this must surface as the same
    # 400 "Registration failed" a normal duplicate gets - not a 500.
    def boom():
        raise SQLAlchemyError("simulated unique-constraint race")

    monkeypatch.setattr(flask_app.db.session, "commit", boom)
    resp = client.post("/register", json={"email": "race@example.com", "password": "supersecret1"})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Registration failed"


def test_missing_body_is_treated_as_an_empty_object(client):
    # No JSON at all (not even `{}`) should fall through to normal field
    # validation, not blow up parsing a body that was never sent.
    resp = client.post("/login", data="", content_type="application/json")
    assert resp.status_code in (400, 401)


def test_non_object_json_body_is_rejected(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.post("/vehicles", json=[1, 2, 3], headers=headers)
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Request body must be a JSON object"}
