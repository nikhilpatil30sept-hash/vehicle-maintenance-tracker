import hashlib
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import wraps
from threading import Lock

import jwt
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import generate_password_hash, check_password_hash

from models.models import db, User, Vehicle, Record
from validation import (
    ValidationError, require_string, require_int, require_float, require_date, require_id,
    MAX_MAKE, MAX_MODEL, MAX_PLATE, MAX_TASK, MAX_CATEGORY,
    MIN_YEAR, MAX_YEAR, MAX_MILEAGE, MAX_COST,
)

load_dotenv()

app = Flask(__name__)

# Reject oversized bodies before they are parsed. Receipt images arrive here as
# base64, which inflates the raw bytes by ~33%.
MAX_IMAGE_BYTES = 6 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

CORS(app, resources={r"/*": {
    "origins": [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://my-flask-backend-3ehc.onrender.com",
        "https://vehicle-maintenance-tracker-self.vercel.app",
        # Vercel preview deployments. This must be a regex - Flask-CORS does not
        # expand glob patterns, so the old "https://*.vercel.app" entry silently
        # matched nothing and every preview build was blocked.
        r"https://.*\.vercel\.app",
    ],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

database_url = os.environ.get('DATABASE_URL', '')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

# Fail with an actionable message rather than a KeyError or an opaque SQLAlchemy error.
if not database_url:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in."
    )
secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    raise RuntimeError(
        "SECRET_KEY is not set. Copy backend/.env.example to backend/.env and fill it in."
    )

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = secret_key

db.init_app(app)
with app.app_context():
    db.create_all()

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = 'gemini-2.5-flash'
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY = timedelta(days=7)
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128  # bcrypt-style truncation guard + DoS guard on hashing

# Simple in-process throttle for credential stuffing. A multi-process deployment
# needs a shared store (Redis) for this to be authoritative; it is a speed bump,
# not a guarantee.
LOGIN_MAX_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 300
_login_attempts = defaultdict(list)
_login_lock = Lock()


# --- error handling ----------------------------------------------------------

@app.errorhandler(ValidationError)
def handle_validation_error(err):
    return jsonify(err.to_dict()), 400


@app.errorhandler(413)
def handle_too_large(_err):
    return jsonify({"error": "Upload is too large"}), 413


@app.errorhandler(SQLAlchemyError)
def handle_db_error(err):
    # Never leak driver internals to the client; log them instead.
    db.session.rollback()
    app.logger.exception("Database error: %s", err)
    return jsonify({"error": "A database error occurred"}), 500


@app.errorhandler(Exception)
def handle_unexpected_error(err):
    db.session.rollback()
    app.logger.exception("Unhandled error: %s", err)
    return jsonify({"error": "An unexpected error occurred"}), 500


@app.route('/health', methods=['GET'])
def health():
    """Unauthenticated readiness probe, used by dev.sh to sequence frontend startup."""
    return jsonify({"status": "ok"})


# --- auth --------------------------------------------------------------------

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        token = auth_header[len('Bearer '):]
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired, please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid authentication token"}), 401
        g.user_id = payload['user_id']
        return f(*args, **kwargs)
    return wrapper


def get_owned_vehicle(vehicle_id, user_id):
    """Look up a vehicle scoped to its owner. `vehicle_id` must already be an int."""
    return Vehicle.query.filter_by(id=vehicle_id, user_id=user_id).first()


def get_owned_record(record_id, user_id):
    return Record.query.join(Vehicle).filter(
        Record.id == record_id, Vehicle.user_id == user_id
    ).first()


def _json_body():
    """Parse the JSON body, rejecting non-object payloads up front."""
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object")
    return data


def _login_rate_limited(key):
    now = time.monotonic()
    with _login_lock:
        attempts = [t for t in _login_attempts[key] if now - t < LOGIN_WINDOW_SECONDS]
        _login_attempts[key] = attempts
        if len(attempts) >= LOGIN_MAX_ATTEMPTS:
            return True
        attempts.append(now)
        return False


@app.route('/register', methods=['POST'])
def register():
    data = _json_body()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or '@' not in email or len(email) > 255:
        return jsonify({"error": "A valid email is required"}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters"}), 400
    if len(password) > MAX_PASSWORD_LENGTH:
        return jsonify({"error": f"Password must be at most {MAX_PASSWORD_LENGTH} characters"}), 400

    if User.query.filter_by(email=email).first():
        # Deliberately identical to the failure below so registration cannot be
        # used to enumerate which email addresses have accounts.
        return jsonify({"error": "Registration failed"}), 400

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Registration failed"}), 400

    return jsonify({"msg": "Success"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = _json_body()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if _login_rate_limited(request.remote_addr or 'unknown'):
        return jsonify({"error": "Too many login attempts. Try again in a few minutes."}), 429

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    payload = {
        "user_id": user.id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + JWT_EXPIRY,
    }
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm=JWT_ALGORITHM)

    return jsonify({"token": token, "user": {"id": user.id, "email": user.email}})


# --- vehicles ----------------------------------------------------------------

@app.route('/vehicles', methods=['GET', 'POST'])
@require_auth
def handle_vehicles():
    if request.method == 'POST':
        data = _json_body()
        vehicle = Vehicle(
            user_id=g.user_id,
            make=require_string(data, 'make', MAX_MAKE),
            model=require_string(data, 'model', MAX_MODEL),
            year=require_int(data, 'year', MIN_YEAR, MAX_YEAR),
            license_plate=require_string(data, 'license_plate', MAX_PLATE, required=False, default=''),
            current_mileage=require_int(data, 'current_mileage', 0, MAX_MILEAGE),
        )
        db.session.add(vehicle)
        db.session.commit()
        return jsonify(vehicle.to_dict()), 201

    vehicles = Vehicle.query.filter_by(user_id=g.user_id).order_by(Vehicle.id).all()
    return jsonify([v.to_dict() for v in vehicles])


@app.route('/vehicles/<int:v_id>', methods=['PUT'])
@require_auth
def update_vehicle(v_id):
    vehicle = get_owned_vehicle(v_id, g.user_id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    data = _json_body()
    # Only fields actually present in the body are touched, so a partial update
    # cannot blank out the rest of the record.
    if 'make' in data:
        vehicle.make = require_string(data, 'make', MAX_MAKE)
    if 'model' in data:
        vehicle.model = require_string(data, 'model', MAX_MODEL)
    if 'year' in data:
        vehicle.year = require_int(data, 'year', MIN_YEAR, MAX_YEAR)
    if 'license_plate' in data:
        vehicle.license_plate = require_string(
            data, 'license_plate', MAX_PLATE, required=False, default=''
        )
    if 'current_mileage' in data:
        vehicle.current_mileage = require_int(data, 'current_mileage', 0, MAX_MILEAGE)

    db.session.commit()
    return jsonify(vehicle.to_dict())


@app.route('/vehicles/<int:v_id>', methods=['DELETE'])
@require_auth
def delete_vehicle(v_id):
    vehicle = get_owned_vehicle(v_id, g.user_id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404
    db.session.delete(vehicle)
    db.session.commit()
    return jsonify({"msg": "Deleted"})


# --- records -----------------------------------------------------------------

@app.route('/records', methods=['GET', 'POST'])
@require_auth
def handle_records():
    if request.method == 'POST':
        data = _json_body()
        vehicle_id = require_id(data.get('vehicle_id'), 'vehicle_id')
        vehicle = get_owned_vehicle(vehicle_id, g.user_id)
        if not vehicle:
            return jsonify({"error": "Vehicle not found"}), 404

        mileage = require_int(data, 'mileage', 0, MAX_MILEAGE)
        record = Record(
            vehicle_id=vehicle.id,
            date=require_date(data, 'date'),
            task=require_string(data, 'task', MAX_TASK),
            cost=require_float(data, 'cost', 0.0, MAX_COST, required=False, default=0.0),
            mileage=mileage,
            category=require_string(data, 'category', MAX_CATEGORY, required=False, default='General'),
            verification_hash=require_string(
                data, 'receipt_fingerprint', 255, required=False, default=None
            ),
        )
        db.session.add(record)
        # Odometer readings only move forward, so a backdated record must not
        # lower the vehicle's current mileage.
        vehicle.current_mileage = max(vehicle.current_mileage or 0, mileage)
        db.session.commit()
        return jsonify(record.to_dict()), 201

    vehicle_id = require_id(request.args.get('vehicle_id'), 'vehicle_id')
    vehicle = get_owned_vehicle(vehicle_id, g.user_id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404
    records = Record.query.filter_by(vehicle_id=vehicle.id) \
        .order_by(Record.date.desc(), Record.id.desc()).all()
    return jsonify([r.to_dict() for r in records])


@app.route('/records/<int:r_id>', methods=['PUT'])
@require_auth
def update_record(r_id):
    record = get_owned_record(r_id, g.user_id)
    if not record:
        return jsonify({"error": "Record not found"}), 404

    data = _json_body()
    if 'date' in data:
        record.date = require_date(data, 'date')
    if 'task' in data:
        record.task = require_string(data, 'task', MAX_TASK)
    if 'cost' in data:
        record.cost = require_float(data, 'cost', 0.0, MAX_COST, required=False, default=0.0)
    if 'mileage' in data:
        record.mileage = require_int(data, 'mileage', 0, MAX_MILEAGE)
    if 'category' in data:
        record.category = require_string(
            data, 'category', MAX_CATEGORY, required=False, default='General'
        )

    db.session.commit()

    # Editing mileage downward could leave the vehicle's odometer above every
    # record; recompute it from what actually remains.
    vehicle = record.vehicle
    highest = db.session.query(db.func.coalesce(db.func.max(Record.mileage), 0)) \
        .filter(Record.vehicle_id == vehicle.id).scalar()
    if vehicle.current_mileage != highest:
        vehicle.current_mileage = highest
        db.session.commit()

    return jsonify(record.to_dict())


@app.route('/records/<int:r_id>', methods=['DELETE'])
@require_auth
def delete_record(r_id):
    record = get_owned_record(r_id, g.user_id)
    if not record:
        return jsonify({"error": "Record not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"msg": "Deleted"})


@app.route('/summary', methods=['GET'])
@require_auth
def get_summary():
    vehicle_count = Vehicle.query.filter_by(user_id=g.user_id).count()
    total = db.session.query(db.func.coalesce(db.func.sum(Record.cost), 0.0)) \
        .join(Vehicle, Record.vehicle_id == Vehicle.id) \
        .filter(Vehicle.user_id == g.user_id).scalar()
    return jsonify({"vehicle_count": vehicle_count, "total_cost": float(total or 0.0)})


# --- receipt OCR -------------------------------------------------------------

OCR_PROMPT = """You are analyzing a vehicle service receipt. Extract ALL service items and details.

Return JSON with this structure:
{
  "date": "YYYY-MM-DD format",
  "mileage": number (current odometer reading, often in notes section),
  "items": [
    {"task": "description", "cost": number}
  ]
}

Rules:
- Extract EVERY line item charge separately (oil change, inspection, fees, etc)
- Find the odometer/mileage reading (may be in technician notes)
- Convert dates like "October 14, 2025" to "2025-10-14"
- Return ONLY valid JSON, no markdown, no explanations
- If multiple services exist, list them ALL in the items array"""

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/heic'}


@app.route('/api/ocr', methods=['POST'])
@require_auth
def ocr_receipt():
    """Extract service line items from a receipt image.

    The prompt and request shape are built here rather than accepted from the
    client. Previously this endpoint forwarded a caller-supplied `payload`
    verbatim, which let any authenticated user run arbitrary prompts against the
    project's Gemini key.
    """
    if not GEMINI_API_KEY:
        return jsonify({"error": "OCR is not configured"}), 503

    data = _json_body()
    image_b64 = data.get('image')
    mime_type = (data.get('mime_type') or 'image/jpeg').lower()

    if not image_b64 or not isinstance(image_b64, str):
        raise ValidationError("An image is required", "image")
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Unsupported image type", "mime_type")

    # Tolerate a full data: URL as well as bare base64.
    if image_b64.startswith('data:'):
        _, _, image_b64 = image_b64.partition(',')
    if len(image_b64) > MAX_IMAGE_BYTES:
        raise ValidationError("Image is too large", "image")

    payload = {
        "contents": [{
            "parts": [
                {"text": OCR_PROMPT},
                {"inlineData": {"mimeType": mime_type, "data": image_b64}},
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            headers={"x-goog-api-key": GEMINI_API_KEY},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
    except requests.RequestException as e:
        app.logger.warning("OCR upstream failure: %s", e)
        return jsonify({"error": "Receipt analysis is temporarily unavailable"}), 502

    text = (
        result.get('candidates', [{}])[0]
        .get('content', {})
        .get('parts', [{}])[0]
        .get('text', '')
    )
    if not text:
        return jsonify({"error": "Could not read that receipt. Enter the details manually."}), 422

    # A stable identifier for the source image, so a record can be traced back to
    # the receipt it came from. This is provenance, not authenticity - it proves
    # two records came from the same image, nothing more.
    fingerprint = hashlib.sha256(image_b64.encode('utf-8')).hexdigest()[:16].upper()

    return jsonify({"text": text, "receipt_fingerprint": f"SHA256-{fingerprint}"})


if __name__ == '__main__':
    # Local dev default avoids port 5000, which macOS AirPlay Receiver occupies by default.
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5001)))
