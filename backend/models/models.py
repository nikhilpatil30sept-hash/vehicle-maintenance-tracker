from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Initialize SQLAlchemy instance
db = SQLAlchemy()

# Model for a User (Owner of the Vehicles)
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    
    # Relationship to Vehicle (One User can have Many Vehicles)
    vehicles = db.relationship('Vehicle', backref='owner', lazy=True)

    def __repr__(self):
        return f'<User {self.username}>'

# Model for a Vehicle
class Vehicle(db.Model):
    __tablename__ = 'vehicles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    make = db.Column(db.String(80), nullable=False)
    model = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    vin = db.Column(db.String(17), unique=True, nullable=True) # VIN is optional

    # Relationship to MaintenanceRecord (One Vehicle can have Many Records)
    maintenance_records = db.relationship('MaintenanceRecord', backref='vehicle', lazy=True)

    def __repr__(self):
        return f'<Vehicle {self.year} {self.make} {self.model}>'

# Model for a Maintenance Record (Service History)
class MaintenanceRecord(db.Model):
    __tablename__ = 'maintenance_records'
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicles.id'), nullable=False)
    service_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    mileage = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(500), nullable=False)
    cost = db.Column(db.Float, nullable=True) # Service cost

    def __repr__(self):
        return f'<MaintenanceRecord {self.description} on {self.service_date}>'