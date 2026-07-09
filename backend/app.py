import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from models.models import db, User, Vehicle, Record

load_dotenv()

app = Flask(__name__)
# Enhanced CORS to allow connections from your React dev server
CORS(app, resources={r"/*": {
    "origins": [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://my-flask-backend-3ehc.onrender.com",
        "https://vehicle-maintenance-tracker-self.vercel.app",  # Your actual Vercel URL
        "https://*.vercel.app"
    ],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

database_url = os.environ.get('DATABASE_URL', '')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ['SECRET_KEY']

db.init_app(app)

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY = timedelta(days=7)
MIN_PASSWORD_LENGTH = 8


def safe_int(val, default=0):
    try:
        if val is None or str(val).strip() == "": return default
        # Strip commas and currency symbols if AI accidentally includes them
        clean_val = str(val).replace(',', '').replace('$', '').strip()
        return int(float(clean_val))
    except: return default

def safe_float(val, default=0.0):
    try:
        if val is None or str(val).strip() == "": return default
        clean_val = str(val).replace(',', '').replace('$', '').strip()
        return float(clean_val)
    except: return default


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
    return Vehicle.query.filter_by(id=vehicle_id, user_id=user_id).first()


@app.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or '@' not in email:
        return jsonify({"error": "A valid email is required"}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Registration failed"}), 400

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Registration failed"}), 400

    return jsonify({"msg": "Success"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    payload = {
        "user_id": user.id,
        "exp": datetime.now(timezone.utc) + JWT_EXPIRY,
    }
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm=JWT_ALGORITHM)

    return jsonify({"token": token, "user": {"id": user.id, "email": user.email}})


@app.route('/vehicles', methods=['GET', 'POST'])
@require_auth
def handle_vehicles():
    if request.method == 'POST':
        data = request.json or {}
        vehicle = Vehicle(
            user_id=g.user_id,
            make=data.get('make', ''),
            model=data.get('model', ''),
            year=safe_int(data.get('year')),
            license_plate=data.get('license_plate', ''),
            current_mileage=safe_int(data.get('current_mileage')),
        )
        db.session.add(vehicle)
        db.session.commit()
        return jsonify({"msg": "Added"}), 201
    else:
        vehicles = Vehicle.query.filter_by(user_id=g.user_id).all()
        return jsonify([{
            "id": v.id, "make": v.make, "model": v.model, "year": v.year,
            "license_plate": v.license_plate, "current_mileage": v.current_mileage
        } for v in vehicles])


@app.route('/vehicles/<int:v_id>', methods=['PUT'])
@require_auth
def update_vehicle(v_id):
    vehicle = get_owned_vehicle(v_id, g.user_id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404

    data = request.json or {}
    vehicle.make = data.get('make', vehicle.make)
    vehicle.model = data.get('model', vehicle.model)
    vehicle.year = safe_int(data.get('year'), vehicle.year)
    vehicle.license_plate = data.get('license_plate', vehicle.license_plate)
    vehicle.current_mileage = safe_int(data.get('current_mileage'), vehicle.current_mileage)
    db.session.commit()
    return jsonify({"msg": "Updated"})


@app.route('/vehicles/<int:v_id>', methods=['DELETE'])
@require_auth
def delete_vehicle(v_id):
    vehicle = get_owned_vehicle(v_id, g.user_id)
    if not vehicle:
        return jsonify({"error": "Vehicle not found"}), 404
    db.session.delete(vehicle)
    db.session.commit()
    return jsonify({"msg": "Deleted"})


@app.route('/records', methods=['GET', 'POST'])
@require_auth
def handle_records():
    if request.method == 'POST':
        data = request.json or {}
        vehicle = get_owned_vehicle(data.get('vehicle_id'), g.user_id)
        if not vehicle:
            return jsonify({"error": "Vehicle not found"}), 404

        try:
            mileage = safe_int(data.get('mileage'))
            cost = safe_float(data.get('cost'))
            record = Record(
                vehicle_id=vehicle.id,
                date=data['date'],
                task=data['task'],
                cost=cost,
                mileage=mileage,
                category=data.get('category', 'General'),
                verification_hash=data.get('verification_hash') or "",
            )
            db.session.add(record)
            vehicle.current_mileage = max(vehicle.current_mileage, mileage)
            db.session.commit()
            return jsonify({"msg": "Saved"}), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500
    else:
        vehicle = get_owned_vehicle(request.args.get('vehicle_id'), g.user_id)
        if not vehicle:
            return jsonify({"error": "Vehicle not found"}), 404
        records = Record.query.filter_by(vehicle_id=vehicle.id).order_by(Record.date.desc()).all()
        return jsonify([{
            "id": r.id, "date": r.date, "task": r.task, "cost": r.cost,
            "mileage": r.mileage, "v_hash": r.verification_hash
        } for r in records])


@app.route('/records/<int:r_id>', methods=['PUT'])
@require_auth
def update_record(r_id):
    record = Record.query.join(Vehicle).filter(
        Record.id == r_id, Vehicle.user_id == g.user_id
    ).first()
    if not record:
        return jsonify({"error": "Record not found"}), 404

    data = request.json or {}
    record.date = data.get('date', record.date)
    record.task = data.get('task', record.task)
    record.cost = safe_float(data.get('cost'), record.cost or 0.0)
    record.mileage = safe_int(data.get('mileage'), record.mileage)
    db.session.commit()
    return jsonify({"msg": "Updated"})


@app.route('/records/<int:r_id>', methods=['DELETE'])
@require_auth
def delete_record(r_id):
    record = Record.query.join(Vehicle).filter(
        Record.id == r_id, Vehicle.user_id == g.user_id
    ).first()
    if not record:
        return jsonify({"error": "Record not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"msg": "Deleted"})


@app.route('/summary', methods=['GET'])
@require_auth
def get_summary():
    vehicle_count = Vehicle.query.filter_by(user_id=g.user_id).count()
    total = db.session.query(db.func.coalesce(db.func.sum(Record.cost), 0)) \
        .join(Vehicle, Record.vehicle_id == Vehicle.id) \
        .filter(Vehicle.user_id == g.user_id).scalar()
    return jsonify({"vehicle_count": vehicle_count, "total_cost": total})


@app.route('/api/ocr', methods=['POST'])
@require_auth
def ocr_receipt():
    if not GEMINI_API_KEY:
        return jsonify({"error": "OCR is not configured"}), 503

    data = request.json or {}
    payload = data.get('payload')
    if not payload:
        return jsonify({"error": "Missing OCR payload"}), 400

    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}",
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.RequestException as e:
        return jsonify({"error": f"OCR request failed: {e}"}), 502


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=False, host='0.0.0.0')
