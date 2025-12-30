import sqlite3
import hashlib
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
# Enhanced CORS to allow connections from your React dev server
CORS(app, resources={r"/*": {
    "origins": [
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://vehicle-maintenance-tracker-kop8-cbhxghzzx.vercel.app",
        "https://*.vercel.app"  # This allows any Vercel subdomain
    ],
    "methods": ["GET", "POST", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

DB_NAME = 'guardian_v2.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # 1. Ensure core tables exist
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS vehicles 
                 (id INTEGER PRIMARY KEY, user_id INTEGER, make TEXT, model TEXT, 
                  year INTEGER, license_plate TEXT, current_mileage INTEGER)''')
    c.execute('''CREATE TABLE IF NOT EXISTS records 
                 (id INTEGER PRIMARY KEY, vehicle_id INTEGER, date TEXT, 
                  task TEXT, cost REAL, mileage INTEGER, category TEXT, 
                  verification_hash TEXT)''')
    
    # 2. Migration: Check if verification_hash exists
    try:
        c.execute("SELECT verification_hash FROM records LIMIT 1")
    except sqlite3.OperationalError:
        print("Migrating database: Adding verification_hash column...")
        c.execute("ALTER TABLE records ADD COLUMN verification_hash TEXT")
    
    conn.commit()
    conn.close()

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

@app.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT id, username FROM users WHERE username=? AND password=?", (data.get('username'), data.get('password')))
    user = c.fetchone()
    conn.close()
    if user:
        return jsonify({"user": {"id": user[0], "username": user[1]}})
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("INSERT INTO users (username, password) VALUES (?, ?)", (data.get('username'), data.get('password')))
        conn.commit()
        return jsonify({"msg": "Success"}), 201
    except Exception as e:
        return jsonify({"error": "Username already exists"}), 400
    finally:
        conn.close()

@app.route('/vehicles', methods=['GET', 'POST'])
def handle_vehicles():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    if request.method == 'POST':
        data = request.json
        c.execute("INSERT INTO vehicles (user_id, make, model, year, license_plate, current_mileage) VALUES (?,?,?,?,?,?)",
                  (data['user_id'], data['make'], data['model'], safe_int(data['year']), data.get('license_plate',''), safe_int(data['current_mileage'])))
        conn.commit()
        conn.close()
        return jsonify({"msg": "Added"}), 201
    else:
        user_id = request.args.get('user_id')
        c.execute("SELECT * FROM vehicles WHERE user_id=?", (user_id,))
        rows = c.fetchall()
        conn.close()
        return jsonify([{"id": r[0], "make": r[2], "model": r[3], "year": r[4], "license_plate": r[5], "current_mileage": r[6]} for r in rows])

@app.route('/vehicles/<int:v_id>', methods=['DELETE'])
def delete_vehicle(v_id):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("DELETE FROM vehicles WHERE id=?", (v_id,))
    c.execute("DELETE FROM records WHERE vehicle_id=?", (v_id,))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Deleted"})

@app.route('/records', methods=['GET', 'POST'])
def handle_records():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    if request.method == 'POST':
        try:
            data = request.json
            mileage = safe_int(data.get('mileage'))
            cost = safe_float(data.get('cost'))
            v_hash = data.get('verification_hash') or ""
            
            c.execute("INSERT INTO records (vehicle_id, date, task, cost, mileage, category, verification_hash) VALUES (?,?,?,?,?,?,?)",
                      (data['vehicle_id'], data['date'], data['task'], cost, mileage, "General", v_hash))
            
            # Update vehicle mileage to the highest recorded mileage
            c.execute("UPDATE vehicles SET current_mileage = MAX(current_mileage, ?) WHERE id = ?", (mileage, data['vehicle_id']))
            conn.commit()
            return jsonify({"msg": "Saved"}), 201
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            conn.close()
    else:
        v_id = request.args.get('vehicle_id')
        c.execute("SELECT * FROM records WHERE vehicle_id=? ORDER BY date DESC", (v_id,))
        rows = c.fetchall()
        conn.close()
        return jsonify([{"id": r[0], "date": r[2], "task": r[3], "cost": r[4], "mileage": r[5], "v_hash": r[7]} for r in rows])

@app.route('/records/<int:r_id>', methods=['DELETE'])
def delete_record(r_id):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("DELETE FROM records WHERE id=?", (r_id,))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Deleted"})

@app.route('/summary/<int:user_id>', methods=['GET'])
def get_summary(user_id):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM vehicles WHERE user_id=?", (user_id,))
    count = c.fetchone()[0]
    c.execute("SELECT SUM(cost) FROM records JOIN vehicles ON records.vehicle_id = vehicles.id WHERE vehicles.user_id=?", (user_id,))
    total_result = c.fetchone()[0]
    total = total_result if total_result is not None else 0
    conn.close()
    return jsonify({"vehicle_count": count, "total_cost": total})

if __name__ == '__main__':
    init_db()
    app.run(debug=False, host='0.0.0.0')  