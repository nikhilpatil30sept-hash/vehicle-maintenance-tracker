"""register/login, JWT enforcement, and the login rate limiter."""
import jwt
import pytest


class TestRegister:
    def test_creates_a_user(self, client):
        resp = client.post("/register", json={"email": "new@example.com", "password": "supersecret1"})
        assert resp.status_code == 201
        assert resp.get_json() == {"msg": "Success"}

    def test_rejects_duplicate_email_with_generic_message(self, client):
        # The message must be identical to any other registration failure, so
        # the endpoint can't be used to enumerate which emails already exist.
        client.post("/register", json={"email": "dup@example.com", "password": "supersecret1"})
        resp = client.post("/register", json={"email": "dup@example.com", "password": "anotherpass1"})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Registration failed"

    @pytest.mark.parametrize("email", ["", "not-an-email", "x" * 250 + "@example.com"])
    def test_rejects_invalid_email(self, client, email):
        resp = client.post("/register", json={"email": email, "password": "supersecret1"})
        assert resp.status_code == 400

    @pytest.mark.parametrize("password", ["short", "x" * 129])
    def test_rejects_password_outside_length_bounds(self, client, password):
        resp = client.post("/register", json={"email": "pw@example.com", "password": password})
        assert resp.status_code == 400

    def test_lowercases_and_trims_email(self, client, register_and_login):
        client.post("/register", json={"email": "  Mixed.Case@Example.com  ", "password": "supersecret1"})
        resp = client.post("/login", json={"email": "mixed.case@example.com", "password": "supersecret1"})
        assert resp.status_code == 200


class TestLogin:
    def test_returns_token_and_user(self, client):
        client.post("/register", json={"email": "driver@example.com", "password": "supersecret1"})
        resp = client.post("/login", json={"email": "driver@example.com", "password": "supersecret1"})
        body = resp.get_json()
        assert resp.status_code == 200
        assert body["user"]["email"] == "driver@example.com"
        assert "token" in body

    def test_rejects_wrong_password(self, client):
        client.post("/register", json={"email": "driver@example.com", "password": "supersecret1"})
        resp = client.post("/login", json={"email": "driver@example.com", "password": "wrongpass1"})
        assert resp.status_code == 401
        assert resp.get_json()["error"] == "Invalid credentials"

    def test_rejects_unknown_email_with_same_message_as_wrong_password(self, client):
        # Also enumeration-resistant: unknown-email and wrong-password look identical.
        resp = client.post("/login", json={"email": "ghost@example.com", "password": "supersecret1"})
        assert resp.status_code == 401
        assert resp.get_json()["error"] == "Invalid credentials"

    def test_rate_limits_after_repeated_attempts_from_the_same_client(self, client):
        for _ in range(10):
            resp = client.post("/login", json={"email": "nobody@example.com", "password": "wrongpass1"})
            assert resp.status_code == 401
        resp = client.post("/login", json={"email": "nobody@example.com", "password": "wrongpass1"})
        assert resp.status_code == 429


class TestAuthGuard:
    def test_protected_route_requires_a_header(self, client):
        resp = client.get("/vehicles")
        assert resp.status_code == 401

    def test_rejects_a_non_bearer_scheme(self, client):
        resp = client.get("/vehicles", headers={"Authorization": "Token abc"})
        assert resp.status_code == 401

    def test_rejects_garbage_token(self, client):
        resp = client.get("/vehicles", headers={"Authorization": "Bearer not-a-real-token"})
        assert resp.status_code == 401

    def test_rejects_expired_token(self, client, flask_app):
        expired_payload = {"user_id": 1, "iat": 1, "exp": 2}  # long in the past
        token = jwt.encode(expired_payload, flask_app.app.config["SECRET_KEY"], algorithm="HS256")
        resp = client.get("/vehicles", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
        assert "expired" in resp.get_json()["error"].lower()

    def test_rejects_token_signed_with_a_different_key(self, client):
        forged = jwt.encode({"user_id": 1, "exp": 99999999999}, "wrong-key", algorithm="HS256")
        resp = client.get("/vehicles", headers={"Authorization": f"Bearer {forged}"})
        assert resp.status_code == 401

    def test_accepts_a_valid_token(self, client, register_and_login):
        headers, _ = register_and_login()
        resp = client.get("/vehicles", headers=headers)
        assert resp.status_code == 200
