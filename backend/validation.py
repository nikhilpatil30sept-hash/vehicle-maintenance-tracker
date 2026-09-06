"""Request validation helpers.

The previous approach coerced bad input to defaults (`safe_int` turned
"not-a-year" into 0) or let it reach the database and surface as a 500. These
helpers reject bad input at the edge with a specific message instead.
"""

from datetime import date, datetime

# Field limits mirror the column definitions in models/models.py.
MAX_MAKE = 80
MAX_MODEL = 80
MAX_PLATE = 20
MAX_TASK = 500
MAX_CATEGORY = 80

MIN_YEAR = 1885  # first production automobile
MAX_YEAR = date.today().year + 2  # allow next-model-year vehicles
MAX_MILEAGE = 10_000_000
MAX_COST = 10_000_000.0


class ValidationError(Exception):
    """Raised when client input is invalid. Handled globally as a 400."""

    def __init__(self, message, field=None):
        super().__init__(message)
        self.message = message
        self.field = field

    def to_dict(self):
        payload = {"error": self.message}
        if self.field:
            payload["field"] = self.field
        return payload


def _missing(value):
    return value is None or (isinstance(value, str) and not value.strip())


def require_string(data, field, max_length, required=True, default=None):
    """Return a trimmed string, enforcing presence and column length."""
    value = data.get(field, None)

    if _missing(value):
        if required:
            raise ValidationError(f"{field.replace('_', ' ').capitalize()} is required", field)
        return default

    if not isinstance(value, str):
        value = str(value)
    value = value.strip()

    if len(value) > max_length:
        raise ValidationError(
            f"{field.replace('_', ' ').capitalize()} must be {max_length} characters or fewer",
            field,
        )
    return value


def require_int(data, field, minimum, maximum, required=True, default=None):
    """Parse an integer, rejecting junk rather than silently defaulting to 0."""
    value = data.get(field, None)

    if _missing(value):
        if required:
            raise ValidationError(f"{field.replace('_', ' ').capitalize()} is required", field)
        return default

    if isinstance(value, bool):  # bool is an int subclass; never a valid input here
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a number", field)

    try:
        # Tolerate "12,345" and "12345.0" from form input and OCR output.
        cleaned = str(value).replace(',', '').replace('$', '').strip()
        parsed = int(float(cleaned))
    except (TypeError, ValueError):
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a number", field)

    if parsed < minimum or parsed > maximum:
        raise ValidationError(
            f"{field.replace('_', ' ').capitalize()} must be between {minimum} and {maximum}",
            field,
        )
    return parsed


def require_float(data, field, minimum, maximum, required=True, default=None):
    value = data.get(field, None)

    if _missing(value):
        if required:
            raise ValidationError(f"{field.replace('_', ' ').capitalize()} is required", field)
        return default

    try:
        cleaned = str(value).replace(',', '').replace('$', '').strip()
        parsed = float(cleaned)
    except (TypeError, ValueError):
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a number", field)

    if parsed != parsed or parsed in (float('inf'), float('-inf')):  # NaN / inf
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a number", field)

    if parsed < minimum or parsed > maximum:
        raise ValidationError(
            f"{field.replace('_', ' ').capitalize()} must be between {minimum} and {maximum}",
            field,
        )
    return parsed


def require_date(data, field, required=True, default=None):
    """Parse an ISO (YYYY-MM-DD) date into a real date object."""
    value = data.get(field, None)

    if _missing(value):
        if required:
            raise ValidationError("Date is required", field)
        return default

    if isinstance(value, date) and not isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            raise ValidationError("Date must be in YYYY-MM-DD format", field)

    # A service record dated in the future is almost always a typo.
    if parsed > date.today():
        raise ValidationError("Date cannot be in the future", field)
    if parsed.year < 1900:
        raise ValidationError("Date is unrealistically old", field)
    return parsed


def require_id(value, field="id"):
    """Validate a path/query identifier before it reaches the database.

    Passing a raw string straight into a query against an integer column made
    Postgres raise, which surfaced as a 500 on `?vehicle_id=abc`.
    """
    if _missing(value):
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} is required", field)
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a number", field)
    if parsed < 1:
        raise ValidationError(f"{field.replace('_', ' ').capitalize()} must be a positive number", field)
    return parsed
