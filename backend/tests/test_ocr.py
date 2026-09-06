"""The receipt-scanning endpoint, with the Gemini HTTP call mocked out.

These tests never make a real network call - app.requests.post is patched in
every case, so no real GEMINI_API_KEY or network access is required, and
nothing here can burn API quota or leak real receipt images anywhere.
"""
import base64
from unittest.mock import MagicMock, patch

import requests as requests_lib


def _fake_gemini_response(text):
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return mock_resp


def _image_b64():
    return base64.b64encode(b"fake-image-bytes").decode()


def test_requires_auth(client):
    resp = client.post("/api/ocr", json={"image": _image_b64(), "mime_type": "image/jpeg"})
    assert resp.status_code == 401


def test_rejects_missing_image(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.post("/api/ocr", json={"mime_type": "image/jpeg"}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["field"] == "image"


def test_rejects_unsupported_mime_type(client, register_and_login):
    headers, _ = register_and_login()
    resp = client.post("/api/ocr", json={"image": _image_b64(), "mime_type": "image/gif"}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["field"] == "mime_type"


def test_returns_extracted_text_and_a_fingerprint(client, register_and_login):
    headers, _ = register_and_login()
    with patch("app.requests.post") as mock_post:
        mock_post.return_value = _fake_gemini_response('{"date":"2024-01-01","items":[]}')
        resp = client.post(
            "/api/ocr",
            json={"image": _image_b64(), "mime_type": "image/jpeg"},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["text"] == '{"date":"2024-01-01","items":[]}'
    assert body["receipt_fingerprint"].startswith("SHA256-")


def test_fingerprint_is_stable_for_the_same_image(client, register_and_login):
    headers, _ = register_and_login()
    image = _image_b64()
    with patch("app.requests.post") as mock_post:
        mock_post.return_value = _fake_gemini_response("{}")
        first = client.post(
            "/api/ocr", json={"image": image, "mime_type": "image/jpeg"}, headers=headers
        ).get_json()
        second = client.post(
            "/api/ocr", json={"image": image, "mime_type": "image/jpeg"}, headers=headers
        ).get_json()

    assert first["receipt_fingerprint"] == second["receipt_fingerprint"]


def test_returns_502_on_upstream_failure(client, register_and_login):
    headers, _ = register_and_login()
    with patch("app.requests.post", side_effect=requests_lib.RequestException("boom")):
        resp = client.post(
            "/api/ocr",
            json={"image": _image_b64(), "mime_type": "image/jpeg"},
            headers=headers,
        )
    assert resp.status_code == 502


def test_returns_422_when_gemini_returns_no_text(client, register_and_login):
    headers, _ = register_and_login()
    with patch("app.requests.post") as mock_post:
        mock_post.return_value = _fake_gemini_response("")
        resp = client.post(
            "/api/ocr",
            json={"image": _image_b64(), "mime_type": "image/jpeg"},
            headers=headers,
        )
    assert resp.status_code == 422


def test_returns_503_when_ocr_is_not_configured(client, register_and_login, flask_app, monkeypatch):
    headers, _ = register_and_login()
    monkeypatch.setattr(flask_app, "GEMINI_API_KEY", "")
    resp = client.post("/api/ocr", json={"image": _image_b64(), "mime_type": "image/jpeg"}, headers=headers)
    assert resp.status_code == 503


def test_tolerates_a_data_url_prefix(client, register_and_login):
    headers, _ = register_and_login()
    data_url = f"data:image/jpeg;base64,{_image_b64()}"
    with patch("app.requests.post") as mock_post:
        mock_post.return_value = _fake_gemini_response("{}")
        resp = client.post("/api/ocr", json={"image": data_url, "mime_type": "image/jpeg"}, headers=headers)
    assert resp.status_code == 200


def test_rejects_an_oversized_image(client, register_and_login):
    headers, _ = register_and_login()
    huge_image = "A" * (6 * 1024 * 1024 + 1)  # one byte over MAX_IMAGE_BYTES
    resp = client.post("/api/ocr", json={"image": huge_image, "mime_type": "image/jpeg"}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["field"] == "image"
