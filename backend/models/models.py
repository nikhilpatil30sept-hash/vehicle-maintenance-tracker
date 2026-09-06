from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

# Initialize SQLAlchemy instance
db = SQLAlchemy()


def utcnow():
    """Timezone-aware UTC now. datetime.utcnow() is deprecated as of Python 3.12."""
    return datetime.now(timezone.utc)


# Model for a User (Owner of the Vehicles)
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)

    # Relationship to Vehicle (One User can have Many Vehicles)
    vehicles = db.relationship('Vehicle', backref='owner', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.email}>'


# Model for a Vehicle
class Vehicle(db.Model):
    __tablename__ = 'vehicles'
    id = db.Column(db.Integer, primary_key=True)
    # Postgres does not index foreign keys automatically, and every query in the
    # app filters on these columns.
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    make = db.Column(db.String(80), nullable=False)
    model = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    license_plate = db.Column(db.String(20), nullable=True)
    current_mileage = db.Column(db.Integer, nullable=False, default=0)

    # Relationship to Record (One Vehicle can have Many maintenance Records)
    records = db.relationship('Record', backref='vehicle', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            "id": self.id,
            "make": self.make,
            "model": self.model,
            "year": self.year,
            "license_plate": self.license_plate,
            "current_mileage": self.current_mileage,
        }

    def __repr__(self):
        return f'<Vehicle {self.year} {self.make} {self.model}>'


# Model for a Maintenance Record (Service History)
class Record(db.Model):
    __tablename__ = 'records'
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicles.id'), nullable=False, index=True)
    # A real Date, not a string: string ordering only sorts correctly by accident
    # of ISO formatting, and date-range queries are impossible on text.
    date = db.Column(db.Date, nullable=False)
    task = db.Column(db.String(500), nullable=False)
    cost = db.Column(db.Float, nullable=True)
    mileage = db.Column(db.Integer, nullable=False, default=0)
    category = db.Column(db.String(80), nullable=True, default='General')
    # Set when the record was created from a scanned receipt. Not a cryptographic
    # attestation - see receipt_fingerprint for what it actually means.
    verification_hash = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "task": self.task,
            "cost": self.cost,
            "mileage": self.mileage,
            "category": self.category,
            "receipt_fingerprint": self.verification_hash or None,
        }

    def __repr__(self):
        return f'<Record {self.task} on {self.date}>'
