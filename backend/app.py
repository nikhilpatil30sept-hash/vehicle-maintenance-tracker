from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from models.models import db, User, Vehicle, MaintenanceRecord # Import models and db
import os

# Load environment variables from .env file
load_dotenv()

# Get the database URL from the .env file
DATABASE_URL = os.getenv('DATABASE_URL')
SECRET_KEY = os.getenv('SECRET_KEY')

# Check if environment variables are loaded
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env file. Please check your setup.")

# Initialize the Flask application
app = Flask(__name__)

# Configure SQLAlchemy to use the PostgreSQL database URL
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = SECRET_KEY

# Initialize the database with the Flask app
db.init_app(app)

# Enable CORS for all routes (to allow connection from the React frontend on localhost:3000)
CORS(app)

# --- Database Initialization ---
# This block ensures tables are created when the app starts.
with app.app_context():
    # Attempt to create database tables if they do not already exist
    db.create_all()

# --- API Routes ---
# Simple test route to confirm connection from the frontend
@app.route('/', methods=['GET'])
def get_status():
    """Returns a simple message to confirm the Flask backend is running."""
    return "Welcome to the Vehicle Maintenance Backend! (Status: Running)"

# --- Run Server ---
if __name__ == '__main__':
    # Flask will automatically use the PORT specified in .env or default to 5000
    app.run(debug=True)