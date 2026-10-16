"""Safe SQLite backup and restore. Restore never overwrites the live database by default."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.database import connect, inspect_database
from app.schema import REQUIRED_TABLES, SchemaError

BACKUP_NAME_RE = re.compile(r"^dukaanvoice-\d{8}T\d{6}Z(?:-\d+)?\.db$")


class BackupError(RuntimeError):
    """Raised when backup or restore validation fails."""


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _unique_backup_path(backup_dir: Path, stamp: str) -> Path:
    candidate = backup_dir / f"dukaanvoice-{stamp}.db"
    suffix = 2
    while candidate.exists():
        candidate = backup_dir / f"dukaanvoice-{stamp}-{suffix}.db"
        suffix += 1
    return candidate


def _validate_sqlite_file(path: Path, *, must_have_schema: bool) -> None:
    if not path.is_file():
        raise BackupError("The specified database file does not exist.")
    if path.stat().st_size < 100:
        raise BackupError("The specified database file is too small to be valid SQLite.")
    try:
        conn = connect(path, create=False)
    except sqlite3.Error as exc:
        raise BackupError("The specified file could not be opened as SQLite.") from exc
    try:
        row = conn.execute("PRAGMA integrity_check").fetchone()
        if row is None or str(row[0]).lower() != "ok":
            raise BackupError("SQLite integrity check failed.")
        if must_have_schema:
            info = inspect_database(conn)
            tables = set(info["tables"])  # type: ignore[arg-type]
            missing = [name for name in REQUIRED_TABLES if name not in tables]
            if missing:
                raise BackupError("Backup is missing required application tables.")
    finally:
        conn.close()


def create_backup(
    database_path: str | Path | None = None,
    backup_dir: str | Path | None = None,
) -> Path:
    settings = get_settings()
    source = Path(database_path) if database_path is not None else settings.database_path
    dest_dir = Path(backup_dir) if backup_dir is not None else settings.backup_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    _validate_sqlite_file(source, must_have_schema=True)
    dest = _unique_backup_path(dest_dir, _timestamp())
    if dest.exists():
        raise BackupError("Refusing to overwrite an existing backup file.")

    src_conn = connect(source, create=False)
    try:
        dest_conn = sqlite3.connect(dest)
        try:
            src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
    except Exception:
        if dest.exists():
            dest.unlink()
        raise
    finally:
        src_conn.close()

    _validate_sqlite_file(dest, must_have_schema=True)
    return dest.resolve()


def restore_backup(
    backup_path: str | Path,
    destination_path: str | Path,
    *,
    live_database_path: str | Path | None = None,
) -> Path:
    """Copy a validated backup to a new destination.

    The destination must not already exist. The live application database is
    never used as the destination.
    """
    settings = get_settings()
    source = Path(backup_path).expanduser().resolve()
    destination = Path(destination_path).expanduser().resolve()
    live = (
        Path(live_database_path).expanduser().resolve()
        if live_database_path is not None
        else settings.database_path
    )

    if destination.exists():
        raise BackupError("Restore destination already exists. Refusing to overwrite.")
    if destination == live:
        raise BackupError(
            "Restore will not write over the active database. "
            "Choose a new destination file and swap it manually after validation."
        )
    if destination == source:
        raise BackupError("Backup source and restore destination must be different.")

    _validate_sqlite_file(source, must_have_schema=True)
    destination.parent.mkdir(parents=True, exist_ok=True)

    src_conn = connect(source, create=False)
    try:
        dest_conn = sqlite3.connect(destination)
        try:
            src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
    except Exception:
        if destination.exists():
            destination.unlink()
        raise
    finally:
        src_conn.close()

    try:
        _validate_sqlite_file(destination, must_have_schema=True)
    except (BackupError, SchemaError, sqlite3.Error):
        if destination.exists():
            destination.unlink()
        raise
    return destination
