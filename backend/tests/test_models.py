"""Model __repr__ methods.

Trivial, but they're what shows up in logs and debugger output when
something goes wrong - worth a smoke test to make sure they don't themselves
raise (e.g. on a None field).
"""
from datetime import date


def test_user_repr(flask_app):
    user = flask_app.User(email="driver@example.com", password_hash="hash")
    assert "driver@example.com" in repr(user)


def test_vehicle_repr(flask_app):
    vehicle = flask_app.Vehicle(make="Honda", model="Civic", year=2020, user_id=1)
    assert "2020" in repr(vehicle)
    assert "Honda" in repr(vehicle)


def test_record_repr(flask_app):
    record = flask_app.Record(task="Oil change", date=date(2024, 1, 1), vehicle_id=1)
    assert "Oil change" in repr(record)
