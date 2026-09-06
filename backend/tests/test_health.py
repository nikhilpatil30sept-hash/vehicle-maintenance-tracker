"""The unauthenticated readiness probe dev.sh polls before starting the frontend."""


def test_health_check_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_health_check_needs_no_auth(client):
    resp = client.get("/health")
    assert resp.status_code != 401
