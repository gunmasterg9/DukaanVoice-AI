"""Backup and restore tests against temporary databases only."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.backup import BackupError, create_backup, restore_backup
from app.database import connect, initialize_schema


def _seed(db_path: Path) -> None:
    conn = connect(db_path)
    try:
        conn.execute(
            "INSERT INTO products (name, sku, base_unit, stock_qty, purchase_price, selling_price) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("Atta", "SKU-ATTA", "kg", 5000, 4500, 5200),
        )
        conn.commit()
    finally:
        conn.close()


def test_backup_creates_valid_timestamped_copy(initialized_db, tmp_path):
    _seed(initialized_db)
    backup_dir = tmp_path / "backup-copies"
    backup_dir.mkdir()
    backup_path = create_backup(initialized_db, backup_dir)
    assert backup_path.exists()
    assert backup_path.parent == backup_dir.resolve()
    assert backup_path.name.startswith("dukaanvoice-")
    assert backup_path.suffix == ".db"
    assert backup_path.name != initialized_db.name

    conn = connect(backup_path, create=False)
    try:
        row = conn.execute(
            "SELECT sku, purchase_price FROM products"
        ).fetchone()
        assert row["sku"] == "SKU-ATTA"
        assert row["purchase_price"] == 4500
        check = conn.execute("PRAGMA integrity_check").fetchone()[0]
        assert check == "ok"
    finally:
        conn.close()


def test_backup_never_overwrites_existing_file(initialized_db, tmp_path, monkeypatch):
    backup_dir = tmp_path / "backup-copies"
    backup_dir.mkdir()

    from app import backup as backup_module

    monkeypatch.setattr(backup_module, "_timestamp", lambda: "20260115T120000Z")
    first = create_backup(initialized_db, backup_dir)
    second = create_backup(initialized_db, backup_dir)
    assert first != second
    assert first.exists() and second.exists()
    assert first.name == "dukaanvoice-20260115T120000Z.db"
    assert second.name == "dukaanvoice-20260115T120000Z-2.db"


def test_restore_writes_new_file_and_leaves_source(initialized_db, tmp_path):
    _seed(initialized_db)
    backup_dir = tmp_path / "backup-copies"
    backup_dir.mkdir()
    backup_path = create_backup(initialized_db, backup_dir)
    destination = tmp_path / "restored" / "copy.db"

    restored = restore_backup(
        backup_path,
        destination,
        live_database_path=initialized_db,
    )
    assert restored == destination.resolve()
    assert backup_path.exists()
    assert initialized_db.exists()

    live = connect(initialized_db, create=False)
    copy = connect(restored, create=False)
    try:
        live_sku = live.execute("SELECT sku FROM products").fetchone()[0]
        copy_sku = copy.execute("SELECT sku FROM products").fetchone()[0]
        assert live_sku == copy_sku == "SKU-ATTA"
    finally:
        live.close()
        copy.close()


def test_restore_refuses_live_database_and_existing_destination(initialized_db, tmp_path):
    backup_dir = tmp_path / "backup-copies"
    backup_dir.mkdir()
    backup_path = create_backup(initialized_db, backup_dir)

    with pytest.raises(BackupError):
        restore_backup(
            backup_path,
            initialized_db,
            live_database_path=initialized_db,
        )

    existing = tmp_path / "already.db"
    existing.write_bytes(b"not-sqlite-but-present")
    with pytest.raises(BackupError):
        restore_backup(
            backup_path,
            existing,
            live_database_path=initialized_db,
        )


def test_restore_rejects_invalid_backup(tmp_path, initialized_db):
    fake = tmp_path / "fake.db"
    fake.write_text("not a database", encoding="utf-8")
    with pytest.raises(BackupError):
        restore_backup(
            fake,
            tmp_path / "out.db",
            live_database_path=initialized_db,
        )


def test_schema_init_then_backup_round_trip(tmp_path):
    source = tmp_path / "src.db"
    initialize_schema(source)
    _seed(source)
    backup = create_backup(source, tmp_path / "bk")
    restored = restore_backup(backup, tmp_path / "dst.db", live_database_path=source)
    conn = connect(restored, create=False)
    try:
        assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 1
    finally:
        conn.close()
