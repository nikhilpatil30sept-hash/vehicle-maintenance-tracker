"""Real end-to-end integration tests for the critical user path.

Unlike backend/tests/, nothing here uses Flask's test_client or mocks the
network. Every test is a plain HTTP call (via `requests`) against a fully
booted instance of the app - real WSGI server, real database - so this is
the one place that actually proves the deployed app answers requests the
way the rest of the test suite assumes it does.

Run against a live server pointed at by BASE_URL (see
backend/tests_integration/README.md and the `integration-tests` CI job).
Tests are ordered and share state via module-scoped fixtures: each one
extends the same vehicle/record state the previous test built, the same
way a real user's session would.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5001")
TIMEOUT = 10


@pytest.fixture(scope="module")
def user_email():
    # Unique per run so re-running against a persistent database (e.g. by
    # hand, locally) never collides with a previous run's account.
    return f"integration-{uuid.uuid4().hex[:12]}@example.com"


@pytest.fixture(scope="module")
def password():
    return "correct-horse-battery-1"


@pytest.fixture(scope="module")
def state():
    """Mutable bag the ordered tests below fill in as the journey proceeds."""
    return {}


def test_health_check_is_up():
    """Sanity check that fails fast with a clear reason if the server never
    came up, instead of every later test timing out on connection refused."""
    resp = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_register_then_login(user_email, password, state):
    register_resp = requests.post(
        f"{BASE_URL}/register",
        json={"email": user_email, "password": password},
        timeout=TIMEOUT,
    )
    assert register_resp.status_code == 201, register_resp.text

    login_resp = requests.post(
        f"{BASE_URL}/login",
        json={"email": user_email, "password": password},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, login_resp.text
    body = login_resp.json()
    assert "token" in body
    assert body["user"]["email"] == user_email

    state["headers"] = {"Authorization": f"Bearer {body['token']}"}


def test_add_vehicle(state):
    resp = requests.post(
        f"{BASE_URL}/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2019, "current_mileage": 42000},
        headers=state["headers"],
        timeout=TIMEOUT,
    )
    assert resp.status_code == 201, resp.text
    vehicle = resp.json()
    assert vehicle["make"] == "Honda"
    assert vehicle["current_mileage"] == 42000
    state["vehicle_id"] = vehicle["id"]


def test_add_record_advances_vehicle_mileage(state):
    """Adding a service record with a higher mileage than the vehicle's
    current reading should move the vehicle's odometer forward - the exact
    behavior the frontend's "Service Due" badge (VehicleCard.js) reads off
    of. There's no dedicated backend endpoint for that badge; this is the
    real data it's computed from."""
    resp = requests.post(
        f"{BASE_URL}/records",
        json={
            "vehicle_id": state["vehicle_id"],
            "date": "2026-01-15",
            "task": "Oil change",
            "cost": 64.99,
            "mileage": 45000,
            "category": "Maintenance",
        },
        headers=state["headers"],
        timeout=TIMEOUT,
    )
    assert resp.status_code == 201, resp.text
    record = resp.json()
    assert record["task"] == "Oil change"
    assert record["mileage"] == 45000
    state["record_id"] = record["id"]

    vehicles_resp = requests.get(f"{BASE_URL}/vehicles", headers=state["headers"], timeout=TIMEOUT)
    assert vehicles_resp.status_code == 200
    vehicle = next(v for v in vehicles_resp.json() if v["id"] == state["vehicle_id"])
    assert vehicle["current_mileage"] == 45000


def test_records_list_and_summary_reflect_the_new_record(state):
    records_resp = requests.get(
        f"{BASE_URL}/records",
        params={"vehicle_id": state["vehicle_id"]},
        headers=state["headers"],
        timeout=TIMEOUT,
    )
    assert records_resp.status_code == 200
    records = records_resp.json()
    assert len(records) == 1
    assert records[0]["id"] == state["record_id"]

    summary_resp = requests.get(f"{BASE_URL}/summary", headers=state["headers"], timeout=TIMEOUT)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["vehicle_count"] == 1
    assert summary["total_cost"] == pytest.approx(64.99)


def test_another_users_token_cannot_see_this_vehicle(password, state):
    """A real cross-account ownership check hitting the live app, not the
    test_client - a different account's token must not be able to read a
    vehicle it doesn't own."""
    other_email = f"integration-other-{uuid.uuid4().hex[:12]}@example.com"
    requests.post(
        f"{BASE_URL}/register", json={"email": other_email, "password": password}, timeout=TIMEOUT
    )
    login_resp = requests.post(
        f"{BASE_URL}/login", json={"email": other_email, "password": password}, timeout=TIMEOUT
    )
    other_headers = {"Authorization": f"Bearer {login_resp.json()['token']}"}

    resp = requests.put(
        f"{BASE_URL}/vehicles/{state['vehicle_id']}",
        json={"current_mileage": 999999},
        headers=other_headers,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 404


def test_delete_record_then_vehicle_cleans_up(state):
    del_record = requests.delete(
        f"{BASE_URL}/records/{state['record_id']}", headers=state["headers"], timeout=TIMEOUT
    )
    assert del_record.status_code == 200

    del_vehicle = requests.delete(
        f"{BASE_URL}/vehicles/{state['vehicle_id']}", headers=state["headers"], timeout=TIMEOUT
    )
    assert del_vehicle.status_code == 200

    vehicles_resp = requests.get(f"{BASE_URL}/vehicles", headers=state["headers"], timeout=TIMEOUT)
    assert vehicles_resp.json() == []
