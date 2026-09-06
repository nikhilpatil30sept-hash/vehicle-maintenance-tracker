CarKeeper AI: Vehicle Maintenance Tracker

[![CI](https://github.com/nikhilpatil30sept-hash/vehicle-maintenance-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/nikhilpatil30sept-hash/vehicle-maintenance-tracker/actions/workflows/ci.yml)

A full-stack application developed to help vehicle owners manage service records and track maintenance history. This project demonstrates proficiency in Full-Stack Architecture, SQL Database Design, and AI API Integration.

🚀 Key Features

AI Receipt Processing: Integration with the Google Gemini API to automatically extract service dates, costs, and tasks from uploaded maintenance receipts.

Relational Data Management: A robust backend system to handle multi-user accounts, vehicle profiles, and service logs.

Dynamic Dashboard: A responsive React interface featuring real-time maintenance summaries and cost tracking.

▶️ Running Locally

Prerequisites: Python 3, Node.js, and a running PostgreSQL instance.

1. Create the database (once):

       createdb vehicle_db

2. Configure the backend (once):

       cp backend/.env.example backend/.env
       # then edit backend/.env and fill in DATABASE_URL, SECRET_KEY, GEMINI_API_KEY

3. Start the whole stack with a single command:

       ./dev.sh          # or: npm run dev

   This creates the Python venv, installs backend and frontend dependencies on
   first run, starts the Flask API, waits until it answers /health, and only
   then starts the React dev server. Press Ctrl+C once to stop both.

   The API defaults to port 5001 (macOS AirPlay occupies 5000). Override with
   `PORT=5002 ./dev.sh`.

🛠 Technical Stack

Frontend: React.js, Tailwind CSS (Responsive UI/UX design)

Backend: Python Flask (RESTful API Development)

Database: PostgreSQL via SQLAlchemy ORM models

Deployment: Successfully deployed using Vercel (Frontend) and Render (Backend)

📁 Project Structure

/frontend: React source code, including state management for maintenance records and vehicle data.

/backend: Flask API routes, PostgreSQL schema definitions, and logic for AI-powered OCR extraction.

dev.sh: Single-command launcher for the full local stack.

⚙️ Technical Highlights

Data Integrity: Implemented backend coercion helpers (safe_int, safe_float) to normalize numeric input before it reaches the database.

RESTful Design: Developed a clean API architecture supporting full CRUD (Create, Read, Update, Delete) operations for vehicles and maintenance logs.

Scalability: Built with a modular approach, allowing for easy expansion of features like mileage reminders or multi-vehicle comparison.

This project serves as a comprehensive showcase of technical development skills and full-stack integration.