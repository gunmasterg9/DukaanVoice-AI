"""Schema initialization and constraint tests. Temporary files only."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.database import connect, initialize_schema, inspect_database
from app.schema import REQUIRED_TABLES, SCHEMA_VERSION, SchemaError


def _table_sql(conn: sqlite3.Connection, name: str) -> str:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    assert row is not None
    return row[0]


def test_schema_initialization_is_idempotent(tmp_db_path):
    first = initialize_schema(tmp_db_path)
    second = initialize_schema(tmp_db_path)
    assert first["schema_version"] == SCHEMA_VERSION
    assert second["schema_version"] == SCHEMA_VERSION
    conn = connect(tmp_db_path)
    try:
        count = conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
        assert count == 1
    finally:
        conn.close()


def test_required_tables_and_constraints_exist(initialized_db):
    conn = connect(initialized_db)
    try:
        tables = set(inspect_database(conn)["tables"])
        for name in REQUIRED_TABLES:
            assert name in tables

        products_sql = _table_sql(conn, "products")
        assert "UNIQUE" in products_sql.upper()
        assert "purchase_price INTEGER" in products_sql
        assert "selling_price INTEGER" in products_sql
        assert "stock_qty INTEGER" in products_sql

        conversions_sql = _table_sql(conn, "unit_conversions")
        assert "FOREIGN KEY" in conversions_sql.upper()
        assert "factor INTEGER" in conversions_sql

        tx_sql = _table_sql(conn, "transactions")
        assert "idempotency_key" in tx_sql

        items_sql = _table_sql(conn, "transaction_items")
        assert "FOREIGN KEY" in items_sql.upper()
        assert "unit_price INTEGER" in items_sql
        assert "line_total INTEGER" in items_sql

        moves_sql = _table_sql(conn, "inventory_movements")
        assert "FOREIGN KEY" in moves_sql.upper()
    finally:
        conn.close()


def test_foreign_key_enforcement_enabled(initialized_db):
    conn = connect(initialized_db)
    try:
        enabled = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        assert int(enabled) == 1
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO unit_conversions (product_id, from_unit, to_unit, factor) "
                "VALUES (?, ?, ?, ?)",
                (999, "box", "piece", 24000),
            )
            conn.commit()
    finally:
        conn.close()


def test_initialization_does_not_overwrite_existing_database(initialized_db):
    conn = connect(initialized_db)
    try:
        conn.execute(
            "INSERT INTO products (name, sku, base_unit, stock_qty, purchase_price, selling_price) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("Demo Tea", "SKU-TEA-1", "packet", 1000, 1500, 2000),
        )
        conn.commit()
    finally:
        conn.close()

    before = initialized_db.stat().st_size
    initialize_schema(initialized_db)
    after = initialized_db.stat().st_size
    assert initialized_db.is_file()
    assert after >= before

    conn = connect(initialized_db)
    try:
        row = conn.execute(
            "SELECT name, purchase_price FROM products WHERE sku = ?",
            ("SKU-TEA-1",),
        ).fetchone()
        assert row["name"] == "Demo Tea"
        assert row["purchase_price"] == 1500
        assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 1
    finally:
        conn.close()


def test_unversioned_existing_database_is_not_mutated(tmp_path):
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("INSERT INTO products (name) VALUES ('keep-me')")
        conn.commit()
    finally:
        conn.close()

    with pytest.raises(SchemaError):
        initialize_schema(db_path)

    conn = sqlite3.connect(db_path)
    try:
        names = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        ]
        assert names == ["products"]
        assert conn.execute("SELECT name FROM products").fetchone()[0] == "keep-me"
    finally:
        conn.close()


def test_check_constraints_reject_invalid_values(initialized_db):
    conn = connect(initialized_db)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO products (name, sku, base_unit, stock_qty) VALUES (?, ?, ?, ?)",
                ("Bad", "SKU-BAD", "kg", -1),
            )
            conn.commit()
        conn.rollback()
        conn.execute(
            "INSERT INTO products (name, sku, base_unit) VALUES (?, ?, ?)",
            ("Ok", "SKU-OK", "kg"),
        )
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO unit_conversions (product_id, from_unit, to_unit, factor) "
                "VALUES (?, ?, ?, ?)",
                (1, "kg", "kg", 1000),
            )
            conn.commit()
    finally:
        conn.close()


def test_initialize_does_not_delete_database_file(tmp_db_path):
    initialize_schema(tmp_db_path)
    assert Path(tmp_db_path).exists()
    initialize_schema(tmp_db_path)
    assert Path(tmp_db_path).exists()
