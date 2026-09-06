"""The /summary aggregate endpoint."""


def test_summary_totals_cost_across_all_of_a_users_vehicles(client, register_and_login):
    headers, _ = register_and_login()
    v1 = client.post(
        "/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 0},
        headers=headers,
    ).get_json()
    v2 = client.post(
        "/vehicles",
        json={"make": "Toyota", "model": "Corolla", "year": 2019, "current_mileage": 0},
        headers=headers,
    ).get_json()
    client.post(
        "/records",
        json={"vehicle_id": v1["id"], "date": "2024-01-01", "task": "Oil change", "cost": 50, "mileage": 100},
        headers=headers,
    )
    client.post(
        "/records",
        json={"vehicle_id": v2["id"], "date": "2024-01-01", "task": "Brakes", "cost": 150.5, "mileage": 200},
        headers=headers,
    )

    summary = client.get("/summary", headers=headers).get_json()
    assert summary["vehicle_count"] == 2
    assert summary["total_cost"] == 200.5


def test_summary_is_zero_for_a_new_user(client, register_and_login):
    headers, _ = register_and_login()
    assert client.get("/summary", headers=headers).get_json() == {"vehicle_count": 0, "total_cost": 0.0}


def test_summary_is_scoped_to_its_owner(client, register_and_login):
    headers_a, _ = register_and_login(email="a@example.com")
    headers_b, _ = register_and_login(email="b@example.com")
    v = client.post(
        "/vehicles",
        json={"make": "Honda", "model": "Civic", "year": 2020, "current_mileage": 0},
        headers=headers_a,
    ).get_json()
    client.post(
        "/records",
        json={"vehicle_id": v["id"], "date": "2024-01-01", "task": "Oil change", "cost": 999, "mileage": 100},
        headers=headers_a,
    )

    summary_b = client.get("/summary", headers=headers_b).get_json()
    assert summary_b == {"vehicle_count": 0, "total_cost": 0.0}


def test_summary_requires_auth(client):
    resp = client.get("/summary")
    assert resp.status_code == 401
