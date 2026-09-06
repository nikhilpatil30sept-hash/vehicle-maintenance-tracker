"""Unit tests for validation.py's pure request-parsing helpers.

No Flask app or database needed here - these are plain functions, which is
exactly why they're the cheapest, fastest tests to write and run.
"""
from datetime import date, timedelta

import pytest

from validation import (
    ValidationError,
    require_date,
    require_float,
    require_id,
    require_int,
    require_string,
)


class TestRequireString:
    def test_trims_and_returns_value(self):
        assert require_string({"make": "  Honda  "}, "make", 80) == "Honda"

    def test_raises_when_missing_and_required(self):
        with pytest.raises(ValidationError) as exc:
            require_string({}, "make", 80)
        assert exc.value.field == "make"

    def test_raises_when_blank_string(self):
        with pytest.raises(ValidationError):
            require_string({"make": "   "}, "make", 80)

    def test_returns_default_when_optional_and_missing(self):
        assert require_string({}, "license_plate", 20, required=False, default="") == ""

    def test_rejects_value_over_max_length(self):
        with pytest.raises(ValidationError):
            require_string({"make": "x" * 81}, "make", 80)

    def test_coerces_non_string_input(self):
        # OCR / form data can hand back numbers for text fields.
        assert require_string({"make": 2020}, "make", 80) == "2020"


class TestRequireInt:
    def test_parses_plain_integer(self):
        assert require_int({"year": 2020}, "year", 1885, 2030) == 2020

    def test_tolerates_comma_and_currency_formatting(self):
        assert require_int({"mileage": "12,345"}, "mileage", 0, 1_000_000) == 12345
        assert require_int({"mileage": "$12345.00"}, "mileage", 0, 1_000_000) == 12345

    def test_rejects_bool_even_though_bool_is_an_int_subclass(self):
        with pytest.raises(ValidationError):
            require_int({"year": True}, "year", 1885, 2030)

    def test_rejects_non_numeric_junk(self):
        with pytest.raises(ValidationError):
            require_int({"year": "not-a-year"}, "year", 1885, 2030)

    def test_rejects_value_below_minimum(self):
        with pytest.raises(ValidationError):
            require_int({"year": 1000}, "year", 1885, 2030)

    def test_rejects_value_above_maximum(self):
        with pytest.raises(ValidationError):
            require_int({"year": 3000}, "year", 1885, 2030)

    def test_returns_default_when_optional_and_missing(self):
        assert require_int({}, "mileage", 0, 100, required=False, default=0) == 0

    def test_raises_when_missing_and_required(self):
        with pytest.raises(ValidationError) as exc:
            require_int({}, "year", 1885, 2030)
        assert exc.value.field == "year"


class TestRequireFloat:
    def test_parses_currency_formatted_string(self):
        assert require_float({"cost": "$1,234.56"}, "cost", 0, 10_000) == 1234.56

    def test_rejects_nan(self):
        with pytest.raises(ValidationError):
            require_float({"cost": float("nan")}, "cost", 0, 10_000)

    def test_rejects_infinity(self):
        with pytest.raises(ValidationError):
            require_float({"cost": float("inf")}, "cost", 0, 10_000)

    def test_rejects_out_of_range(self):
        with pytest.raises(ValidationError):
            require_float({"cost": -5}, "cost", 0, 10_000)

    def test_rejects_non_numeric_string(self):
        with pytest.raises(ValidationError):
            require_float({"cost": "free"}, "cost", 0, 10_000)

    def test_raises_when_missing_and_required(self):
        with pytest.raises(ValidationError) as exc:
            require_float({}, "cost", 0, 10_000)
        assert exc.value.field == "cost"

    def test_returns_default_when_optional_and_missing(self):
        assert require_float({}, "cost", 0, 10_000, required=False, default=0.0) == 0.0


class TestRequireDate:
    def test_parses_iso_date(self):
        assert require_date({"date": "2024-01-15"}, "date") == date(2024, 1, 15)

    def test_rejects_future_date(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        with pytest.raises(ValidationError):
            require_date({"date": tomorrow}, "date")

    def test_accepts_today(self):
        # A same-day service record is valid, not "in the future".
        assert require_date({"date": date.today().isoformat()}, "date") == date.today()

    def test_rejects_unrealistically_old_date(self):
        with pytest.raises(ValidationError):
            require_date({"date": "1899-12-31"}, "date")

    def test_rejects_malformed_date_string(self):
        with pytest.raises(ValidationError):
            require_date({"date": "15/01/2024"}, "date")

    def test_returns_default_when_optional_and_missing(self):
        assert require_date({}, "date", required=False, default=None) is None

    def test_raises_when_missing_and_required(self):
        with pytest.raises(ValidationError, match="Date is required"):
            require_date({}, "date")

    def test_accepts_a_python_date_object_directly(self):
        # The OCR flow and internal callers can hand back a real date, not a
        # string - it should pass through rather than fail strptime parsing.
        today = date.today()
        assert require_date({"date": today}, "date") == today


class TestRequireId:
    def test_parses_valid_positive_id(self):
        assert require_id("42") == 42

    def test_rejects_non_numeric(self):
        with pytest.raises(ValidationError):
            require_id("abc")

    def test_rejects_zero(self):
        with pytest.raises(ValidationError):
            require_id("0")

    def test_rejects_negative(self):
        with pytest.raises(ValidationError):
            require_id("-5")

    def test_rejects_missing_value(self):
        with pytest.raises(ValidationError):
            require_id(None)
