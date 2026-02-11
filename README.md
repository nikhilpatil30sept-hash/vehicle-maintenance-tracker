CarKeeper AI: Vehicle Maintenance Tracker & QA Showcase

A full-stack application designed to track vehicle service history, developed with a focus on Data Integrity and Automated Quality Assurance.

🚀 Project Architecture

Frontend: React.js (Tailwind CSS) - Located in /frontend

Backend: Python Flask (REST API) - Located in /backend

Database: SQL (SQLite)

Automation Testing: Cypress (End-to-End UI Testing)

🧪 Quality Assurance & Testing (ISTQB Aligned)

This project serves as a technical showcase for modern QA methodologies:

E2E Automation: A comprehensive suite using Cypress to validate critical user journeys:

User Registration & Authentication flow.

Vehicle CRUD operations (Create, Read, Update, Delete).

Responsive UI validation.

Data Validation: Robust backend error handling and data type safety to ensure database integrity.

SQL Best Practices: Implementation of a relational schema with foreign key constraints.

🛠 Setup & Installation

Backend

Navigate to /backend

Create a virtual environment: python -m venv venv

Install dependencies: pip install -r requirements.txt

Run the server: python app.py

Frontend

Navigate to /frontend

Install dependencies: npm install

Start the app: npm start

🚦 Running Automated Tests

To run the E2E test suite:

Ensure both Frontend and Backend are running.

In the /frontend directory, run:

npx cypress open


Select carkeeper_test.cy.js from the Cypress interface.

Developed as a showcase of technical growth in Automation and Quality Engineering.