"""Maintenance record CRUD, ownership scoping, and the vehicle-mileage rules.

The mileage rules are the app's least obvious business logic:
- creating a record raises the vehicle's current_mileage to max(existing, new)
- a backdated record (lower mileage) must NOT lower the vehicle's odometer
- editing a record's mileage down must recompute the vehicle's odometer from
  whatever records actually remain, in case it was the highest one
"""
import pytest


@pytest.fixture
def vehicle(client, register_and_login):
    """A signed-in user with one vehicle already at 10,000 miles."""
    headers, _ = register_and_login()
    v = client.post(
        "/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 10000},
        headers=headers,
    ).get_json()
    return headers, v


def _create_record(client, headers, vehicle_id, **overrides):
    payload = {
        "vehicle_id": vehicle_id, "date": "2024-01-01", "task": "Oil change", "cost": 50, "mileage": 100,
    }
    payload.update(overrides)
    return client.post("/records", json=payload, headers=headers)


def _current_mileage(client, headers):
    return client.get("/vehicles", headers=headers).get_json()[0]["current_mileage"]


class TestOwnership:
    def test_create_record_requires_auth(self, client, vehicle):
        _, v = vehicle
        resp = client.post("/records", json={
            "vehicle_id": v["id"], "date": "2024-01-01", "task": "Oil change", "cost": 50, "mileage": 100,
        })
        assert resp.status_code == 401

    def test_cannot_create_a_record_on_someone_elses_vehicle(self, client, register_and_login):
        headers_a, _ = register_and_login(email="a@example.com")
        headers_b, _ = register_and_login(email="b@example.com")
        v = client.post(
            "/vehicles", json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 0},
            headers=headers_a,
        ).get_json()

        resp = _create_record(client, headers_b, v["id"])
        assert resp.status_code == 404

    def test_cannot_list_records_for_someone_elses_vehicle(self, client, register_and_login, vehicle):
        headers_owner, v = vehicle
        headers_other, _ = register_and_login(email="other@example.com")
        resp = client.get(f"/records?vehicle_id={v['id']}", headers=headers_other)
        assert resp.status_code == 404

    def test_cannot_delete_someone_elses_record(self, client, register_and_login):
        headers_a, _ = register_and_login(email="a@example.com")
        headers_b, _ = register_and_login(email="b@example.com")
        v = client.post(
            "/vehicles", json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 0},
            headers=headers_a,
        ).get_json()
        record = _create_record(client, headers_a, v["id"]).get_json()

        resp = client.delete(f"/records/{record['id']}", headers=headers_b)
        assert resp.status_code == 404


class TestValidation:
    def test_listing_records_requires_a_vehicle_id(self, client, vehicle):
        headers, _ = vehicle
        resp = client.get("/records", headers=headers)
        assert resp.status_code == 400

    def test_listing_records_rejects_a_non_numeric_vehicle_id(self, client, vehicle):
        headers, _ = vehicle
        resp = client.get("/records?vehicle_id=abc", headers=headers)
        assert resp.status_code == 400

    def test_create_record_requires_a_task(self, client, vehicle):
        headers, v = vehicle
        resp = client.post("/records", json={
            "vehicle_id": v["id"], "date": "2024-01-01", "cost": 50, "mileage": 100,
        }, headers=headers)
        assert resp.status_code == 400
        assert resp.get_json()["field"] == "task"


class TestMileageRules:
    def test_creating_a_record_raises_vehicle_mileage_to_the_new_high(self, client, vehicle):
        headers, v = vehicle  # starts at 10,000
        _create_record(client, headers, v["id"], mileage=15000)
        assert _current_mileage(client, headers) == 15000

    def test_backdated_record_does_not_lower_the_odometer(self, client, vehicle):
        headers, v = vehicle  # starts at 10,000
        resp = _create_record(client, headers, v["id"], date="2020-01-01", mileage=500)
        assert resp.status_code == 201
        assert _current_mileage(client, headers) == 10000  # unchanged

    def test_editing_mileage_upward_raises_the_odometer(self, client, vehicle):
        headers, v = vehicle
        record = _create_record(client, headers, v["id"], mileage=11000).get_json()
        client.put(f"/records/{record['id']}", json={"mileage": 30000}, headers=headers)
        assert _current_mileage(client, headers) == 30000

    def test_editing_mileage_down_recomputes_the_odometer_from_remaining_records(self, client, vehicle):
        headers, v = vehicle
        record = _create_record(client, headers, v["id"], mileage=20000).get_json()
        assert _current_mileage(client, headers) == 20000

        client.put(f"/records/{record['id']}", json={"mileage": 12000}, headers=headers)
        # No other record is higher, so the odometer must follow it back down.
        assert _current_mileage(client, headers) == 12000

    def test_editing_mileage_down_keeps_the_highest_remaining_record(self, client, vehicle):
        headers, v = vehicle
        low = _create_record(client, headers, v["id"], task="First service", mileage=11000).get_json()
        _create_record(client, headers, v["id"], task="Second service", mileage=25000)
        assert _current_mileage(client, headers) == 25000

        # Editing the *lower* record down should not affect the odometer at all.
        client.put(f"/records/{low['id']}", json={"mileage": 10500}, headers=headers)
        assert _current_mileage(client, headers) == 25000


class TestCrud:
    def test_deleting_a_record(self, client, vehicle):
        headers, v = vehicle
        record = _create_record(client, headers, v["id"]).get_json()
        resp = client.delete(f"/records/{record['id']}", headers=headers)
        assert resp.status_code == 200
        assert client.get(f"/records?vehicle_id={v['id']}", headers=headers).get_json() == []

    def test_records_are_listed_most_recent_first(self, client, vehicle):
        headers, v = vehicle
        _create_record(client, headers, v["id"], task="Older", date="2023-01-01", mileage=100)
        _create_record(client, headers, v["id"], task="Newer", date="2024-06-01", mileage=200)

        records = client.get(f"/records?vehicle_id={v['id']}", headers=headers).get_json()
        assert [r["task"] for r in records] == ["Newer", "Older"]


class TestUpdateAllFields:
    def test_update_returns_404_for_an_unknown_record(self, client, vehicle):
        headers, _ = vehicle
        resp = client.put("/records/999999", json={"task": "Ghost"}, headers=headers)
        assert resp.status_code == 404

    def test_update_can_change_every_field_at_once(self, client, vehicle):
        headers, v = vehicle
        record = _create_record(client, headers, v["id"]).get_json()

        resp = client.put(f"/records/{record['id']}", json={
            "date": "2024-02-02", "task": "Brake replacement", "cost": 250.75, "category": "Brakes",
        }, headers=headers)

        updated = resp.get_json()
        assert updated["date"] == "2024-02-02"
        assert updated["task"] == "Brake replacement"
        assert updated["cost"] == 250.75
        assert updated["category"] == "Brakes"
