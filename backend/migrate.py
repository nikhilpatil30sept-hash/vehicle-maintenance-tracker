"""One-off schema migration for existing databases.

`db.create_all()` only creates missing tables - it never alters existing ones, so
a database created before this change still has `records.date` as VARCHAR and is
missing the foreign-key indexes. Run this once against each environment:

    cd backend && venv/bin/python migrate.py

It is idempotent and safe to re-run.
"""

import sys

from sqlalchemy import inspect, text

from app import app, db


def column_type(inspector, table, column):
    for col in inspector.get_columns(table):
        if col['name'] == column:
            return str(col['type']).upper()
    return None


def existing_indexes(inspector, table):
    return {ix['name'] for ix in inspector.get_indexes(table)}


def migrate():
    with app.app_context():
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        if 'records' not in tables:
            print("No existing tables - db.create_all() will build the current schema. Nothing to migrate.")
            return 0

        # 1. records.date : VARCHAR -> DATE
        date_type = column_type(inspector, 'records', 'date')
        if date_type and ('CHAR' in date_type or date_type == 'TEXT'):
            print(f"records.date is {date_type}; converting to DATE...")

            bad = db.session.execute(text(
                "SELECT id, date FROM records WHERE date !~ '^\\d{4}-\\d{2}-\\d{2}$'"
            )).fetchall()
            if bad:
                print(f"  {len(bad)} row(s) hold values that are not YYYY-MM-DD and cannot be converted:")
                for row in bad:
                    print(f"    record id={row[0]} date={row[1]!r}")
                print("  Fix or delete these rows, then re-run. Aborting without changes.")
                return 1

            db.session.execute(text(
                "ALTER TABLE records ALTER COLUMN date TYPE DATE USING date::date"
            ))
            db.session.commit()
            print("  done.")
        else:
            print(f"records.date is already {date_type}; skipping.")

        # 2. users.created_at : timestamp -> timestamptz
        created_type = column_type(inspector, 'users', 'created_at')
        if created_type and 'TIMEZONE' not in created_type.replace(' ', ''):
            print(f"users.created_at is {created_type}; converting to TIMESTAMPTZ...")
            db.session.execute(text(
                "ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ "
                "USING created_at AT TIME ZONE 'UTC'"
            ))
            db.session.commit()
            print("  done.")
        else:
            print("users.created_at already timezone-aware; skipping.")

        # 3. Foreign-key indexes (Postgres does not create these automatically)
        wanted = [
            ('ix_vehicles_user_id', 'vehicles', 'user_id'),
            ('ix_records_vehicle_id', 'records', 'vehicle_id'),
            ('ix_users_email', 'users', 'email'),
        ]
        for name, table, column in wanted:
            if name in existing_indexes(inspector, table):
                print(f"index {name} already present; skipping.")
                continue
            print(f"creating index {name} on {table}({column})...")
            db.session.execute(text(
                f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})"
            ))
            db.session.commit()

        # 4. Backfill guards for rows written before validation existed.
        cleaned = db.session.execute(text(
            "UPDATE vehicles SET current_mileage = 0 WHERE current_mileage < 0"
        )).rowcount
        if cleaned:
            print(f"reset {cleaned} negative odometer value(s) to 0.")
        db.session.commit()

        print("\nMigration complete.")
        return 0


if __name__ == '__main__':
    sys.exit(migrate())
