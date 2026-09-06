"""Vehicle CRUD, including per-owner scoping (IDOR protection)."""

VEHICLE = {"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 15000}


def test_create_vehicle_requires_auth(client):
    resp = client.post("/vehicles", json=VEHICLE)
    assert resp.status_code == 401


def test_create_and_list_vehicle(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.post("/vehicles", json=VEHICLE, headers=headers)
    assert resp.status_code == 201
    vehicle = resp.get_json()
    assert vehicle["make"] == "Honda"
    assert vehicle["license_plate"] == ""

    listed = client.get("/vehicles", headers=headers).get_json()
    assert len(listed) == 1
    assert listed[0]["id"] == vehicle["id"]


def test_create_vehicle_rejects_invalid_year(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.post("/vehicles", json={**VEHICLE, "year": 1000}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["field"] == "year"


def test_vehicle_list_is_scoped_to_its_owner(client, register_and_login):
    headers_a, _ = register_and_login(email="a@example.com")
    headers_b, _ = register_and_login(email="b@example.com")
    client.post("/vehicles", json=VEHICLE, headers=headers_a)

    assert client.get("/vehicles", headers=headers_b).get_json() == []
    assert len(client.get("/vehicles", headers=headers_a).get_json()) == 1


def test_cannot_update_another_users_vehicle(client, register_and_login):
    headers_a, _ = register_and_login(email="a@example.com")
    headers_b, _ = register_and_login(email="b@example.com")
    created = client.post("/vehicles", json=VEHICLE, headers=headers_a).get_json()

    resp = client.put(f"/vehicles/{created['id']}", json={"make": "Hacked"}, headers=headers_b)
    assert resp.status_code == 404
    # And it really wasn't touched.
    still = client.get("/vehicles", headers=headers_a).get_json()[0]
    assert still["make"] == "Honda"


def test_cannot_delete_another_users_vehicle(client, register_and_login):
    headers_a, _ = register_and_login(email="a@example.com")
    headers_b, _ = register_and_login(email="b@example.com")
    created = client.post("/vehicles", json=VEHICLE, headers=headers_a).get_json()

    resp = client.delete(f"/vehicles/{created['id']}", headers=headers_b)
    assert resp.status_code == 404
    assert len(client.get("/vehicles", headers=headers_a).get_json()) == 1


def test_update_returns_404_for_unknown_vehicle(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.put("/vehicles/999999", json={"make": "Ghost"}, headers=headers)
    assert resp.status_code == 404


def test_partial_update_only_touches_provided_fields(client, register_and_login):
    headers, _ = register_and_login()
    created = client.post(
        "/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2020, "license_plate": "ABC123", "current_mileage": 100},
        headers=headers,
    ).get_json()

    resp = client.put(f"/vehicles/{created['id']}", json={"current_mileage": 200}, headers=headers)
    updated = resp.get_json()
    assert updated["current_mileage"] == 200
    assert updated["license_plate"] == "ABC123"  # untouched
    assert updated["make"] == "Honda"  # untouched


def test_deleting_vehicle_cascades_to_its_records(client, register_and_login):
    headers, _ = register_and_login()
    vehicle = client.post("/vehicles", json=VEHICLE, headers=headers).get_json()
    client.post(
        "/records",
        json={"vehicle_id": vehicle["id"], "date": "2024-01-01", "task": "Oil change", "cost": 50, "mileage": 500},
        headers=headers,
    )

    client.delete(f"/vehicles/{vehicle['id']}", headers=headers)

    # The vehicle is gone, so its record history is unreachable through the API too.
    resp = client.get(f"/records?vehicle_id={vehicle['id']}", headers=headers)
    assert resp.status_code == 404


def test_update_can_change_every_field_at_once(client, register_and_login):
    headers, _ = register_and_login()
    created = client.post("/vehicles", json=VEHICLE, headers=headers).get_json()

    resp = client.put(f"/vehicles/{created['id']}", json={
        "make": "Toyota", "model": "Corolla", "year": 2022, "license_plate": "NEW123",
    }, headers=headers)

    updated = resp.get_json()
    assert updated["make"] == "Toyota"
    assert updated["model"] == "Corolla"
    assert updated["year"] == 2022
    assert updated["license_plate"] == "NEW123"
