"""Command-line helpers for schema init, backup, and restore."""

from __future__ import annotations

import argparse
import sys

from app.backup import create_backup, restore_backup
from app.config import get_settings
from app.database import initialize_schema


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DukaanVoice AI database utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Create or verify the SQLite schema")
    sub.add_parser("backup", help="Write a timestamped backup that never overwrites")

    restore = sub.add_parser(
        "restore",
        help="Restore a backup to a NEW file (never the live database)",
    )
    restore.add_argument("--backup", required=True, help="Path to a backup .db file")
    restore.add_argument(
        "--destination",
        required=True,
        help="New file path. Must not exist and must not be the live database.",
    )

    args = parser.parse_args(argv)
    settings = get_settings()

    if args.command == "init-db":
        result = initialize_schema()
        print(f"Schema version {result['schema_version']} is ready.")
        return 0

    if args.command == "backup":
        path = create_backup()
        print(f"Backup written to {path}")
        return 0

    if args.command == "restore":
        path = restore_backup(
            args.backup,
            args.destination,
            live_database_path=settings.database_path,
        )
        print(f"Restored copy written to {path}")
        print("The live database was not changed.")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
