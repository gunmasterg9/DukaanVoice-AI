"""SQLite connection handling and idempotent schema initialization."""

from __future__ import annotations

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from app.config import Settings, get_settings
from app.schema import (
    MIGRATION_001_STATEMENTS,
    MIGRATION_002_STATEMENTS,
    MIGRATION_003_STATEMENTS,
    MIGRATION_004_STATEMENTS,
    REQUIRED_TABLES,
    SCHEMA_VERSION,
    SchemaError,
    current_schema_version,
    list_user_tables,
)


def _as_path(database_path: str | Path | None, settings: Settings | None = None) -> Path:
    if database_path is not None:
        return Path(database_path).expanduser().resolve()
    active = settings or get_settings()
    return active.database_path


def connect(database_path: str | Path, *, create: bool = True) -> sqlite3.Connection:
    """Open SQLite with foreign keys enforced.

    If create is False, the file is opened read-only and is not created.
    """
    path = Path(database_path)
    if not create:
        if not path.is_file():
            raise FileNotFoundError("Database file is not available.")
        uri = path.resolve().as_uri()
        conn = sqlite3.connect(f"{uri}?mode=ro", uri=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def connection(
    database_path: str | Path | None = None,
    *,
    create: bool = True,
) -> Generator[sqlite3.Connection, None, None]:
    settings = get_settings()
    path = _as_path(database_path, settings)
    conn = connect(path, create=create)
    try:
        yield conn
        if create:
            conn.commit()
    except Exception:
        if create:
            conn.rollback()
        raise
    finally:
        conn.close()


def inspect_database(conn: sqlite3.Connection) -> dict[str, object]:
    tables = sorted(list_user_tables(conn))
    version = current_schema_version(conn)
    return {
        "tables": tables,
        "schema_version": version,
        "foreign_keys": conn.execute("PRAGMA foreign_keys").fetchone()[0],
    }


def initialize_schema(database_path: str | Path | None = None) -> dict[str, object]:
    """Create schema version 1 if needed. Never drops or deletes an existing database."""
    path = _as_path(database_path)
    existed = path.is_file()
    with connection(path, create=True) as conn:
        info = inspect_database(conn)
        tables = set(info["tables"])  # type: ignore[arg-type]
        version = info["schema_version"]

        if existed and tables and "schema_migrations" not in tables:
            raise SchemaError(
                "An existing database was found without schema versioning. "
                "Initialization refused so that data is not changed automatically."
            )

        if version is None:
            for statement in MIGRATION_001_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                (1, "001_initial_foundation"),
            )
            version = 1

        if int(version) == 1:
            conn.commit()
            conn.execute("PRAGMA foreign_keys = OFF")
            try:
                for statement in MIGRATION_002_STATEMENTS:
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                    (2, "002_optional_sku"),
                )
                conn.commit()
            finally:
                conn.execute("PRAGMA foreign_keys = ON")

            fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
            if fk_errors:
                raise SchemaError(f"Foreign key violations detected during migration: {fk_errors}")
            version = 2

        if int(version) == 2:
            conn.commit()
            for statement in MIGRATION_003_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                (3, "003_customers_and_ledger"),
            )
            conn.commit()
            version = 3

        if int(version) == 3:
            conn.commit()
            for statement in MIGRATION_004_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                (4, "004_expenses_and_cash_closing"),
            )
            conn.commit()
            version = 4

        if int(version) < SCHEMA_VERSION:
            raise SchemaError(
                "Database schema is older than this application. "
                "Apply an explicit migration; tables will not be dropped."
            )
        elif int(version) > SCHEMA_VERSION:
            raise SchemaError(
                "Database schema is newer than this application. "
                "Upgrade the application before opening this file."
            )

        missing = [name for name in REQUIRED_TABLES if name not in list_user_tables(conn)]
        if missing:
            raise SchemaError("Required tables are missing after initialization.")

        fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        if int(fk) != 1:
            raise SchemaError("Foreign keys are not enabled on this connection.")

    return {
        "database_existed": existed,
        "schema_version": SCHEMA_VERSION,
        "tables": list(REQUIRED_TABLES),
    }


def ping_database(database_path: str | Path | None = None) -> None:
    """Open the configured database read-only and run a simple query."""
    path = _as_path(database_path)
    with connection(path, create=False) as conn:
        conn.execute("SELECT 1")
        version = current_schema_version(conn)
        if version != SCHEMA_VERSION:
            raise SchemaError("Database schema is not ready.")
        missing = [name for name in REQUIRED_TABLES if name not in list_user_tables(conn)]
        if missing:
            raise SchemaError("Database schema is not ready.")
