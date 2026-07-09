from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Initialize SQLAlchemy instance
db = SQLAlchemy()

# Model for a User (Owner of the Vehicles)
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to Vehicle (One User can have Many Vehicles)
    vehicles = db.relationship('Vehicle', backref='owner', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.email}>'

# Model for a Vehicle
class Vehicle(db.Model):
    __tablename__ = 'vehicles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    make = db.Column(db.String(80), nullable=False)
    model = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    license_plate = db.Column(db.String(20), nullable=True)
    current_mileage = db.Column(db.Integer, nullable=False, default=0)

    # Relationship to Record (One Vehicle can have Many maintenance Records)
    records = db.relationship('Record', backref='vehicle', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Vehicle {self.year} {self.make} {self.model}>'

# Model for a Maintenance Record (Service History)
class Record(db.Model):
    __tablename__ = 'records'
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicles.id'), nullable=False)
    date = db.Column(db.String(20), nullable=False)
    task = db.Column(db.String(500), nullable=False)
    cost = db.Column(db.Float, nullable=True)
    mileage = db.Column(db.Integer, nullable=False, default=0)
    category = db.Column(db.String(80), nullable=True, default='General')
    verification_hash = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<Record {self.task} on {self.date}>'
