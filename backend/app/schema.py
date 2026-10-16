"""SQLite schema version 1 and inspect helpers.

Stock and money conventions (documented in docs/DATABASE_SCHEMA.md):

- Monetary columns are INTEGER paise (1 rupee = 100 paise). Never REAL/float.
- Quantity columns are INTEGER milli-units (1 base unit = 1000 milli-units).
- Transaction line quantities stay in the line's original unit (milli-units).
- Conversion to the product base unit is allowed only via unit_conversions.
"""

from __future__ import annotations

SCHEMA_VERSION = 2

REQUIRED_TABLES = (
    "schema_migrations",
    "products",
    "unit_conversions",
    "transactions",
    "transaction_items",
    "inventory_movements",
)

MIGRATION_001_STATEMENTS = (
    """
    CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        sku TEXT NOT NULL CHECK (length(trim(sku)) > 0),
        category TEXT NOT NULL DEFAULT '',
        stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
        base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
        purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
        selling_price INTEGER NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
        low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (sku)
    )
    """,
    """
    CREATE TABLE unit_conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        from_unit TEXT NOT NULL CHECK (length(trim(from_unit)) > 0),
        to_unit TEXT NOT NULL CHECK (length(trim(to_unit)) > 0),
        factor INTEGER NOT NULL CHECK (factor > 0),
        FOREIGN KEY (product_id) REFERENCES products(id),
        UNIQUE (product_id, from_unit, to_unit),
        CHECK (from_unit <> to_unit)
    )
    """,
    """
    CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('sale', 'purchase')),
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'confirmed', 'reversed')),
        idempotency_key TEXT UNIQUE,
        original_instruction TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        confirmed_at TEXT
    )
    """,
    """
    CREATE TABLE transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        line_total INTEGER NOT NULL CHECK (line_total >= 0),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
    """,
    """
    CREATE TABLE inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        transaction_id INTEGER,
        movement_type TEXT NOT NULL CHECK (
            movement_type IN ('sale', 'purchase', 'adjustment', 'reversal')
        ),
        quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
        stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
        stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    )
    """,
    "CREATE INDEX idx_products_sku ON products(sku)",
    "CREATE INDEX idx_products_active ON products(active)",
    "CREATE INDEX idx_products_category ON products(category)",
    "CREATE INDEX idx_unit_conversions_product ON unit_conversions(product_id)",
    "CREATE INDEX idx_transactions_type_status ON transactions(type, status)",
    "CREATE INDEX idx_transactions_created_at ON transactions(created_at)",
    "CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id)",
    "CREATE INDEX idx_transaction_items_product ON transaction_items(product_id)",
    "CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id)",
    "CREATE INDEX idx_inventory_movements_transaction ON inventory_movements(transaction_id)",
)

MIGRATION_002_STATEMENTS = (
    "DROP TABLE IF EXISTS products_v2",
    """
    CREATE TABLE products_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        sku TEXT CHECK (sku IS NULL OR length(trim(sku)) > 0),
        category TEXT NOT NULL DEFAULT '',
        stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
        base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
        purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
        selling_price INTEGER NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
        low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (sku)
    )
    """,
    """
    INSERT INTO products_v2 (
        id, name, sku, category, stock_qty, base_unit,
        purchase_price, selling_price, low_stock_threshold,
        active, created_at, updated_at
    )
    SELECT
        id, name, sku, category, stock_qty, base_unit,
        purchase_price, selling_price, low_stock_threshold,
        active, created_at, updated_at
    FROM products
    """,
    "DROP TABLE products",
    "ALTER TABLE products_v2 RENAME TO products",
    "CREATE INDEX idx_products_sku ON products(sku)",
    "CREATE INDEX idx_products_active ON products(active)",
    "CREATE INDEX idx_products_category ON products(category)",
)


class SchemaError(RuntimeError):
    """Raised when an existing database cannot be migrated safely."""


def list_user_tables(conn) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def current_schema_version(conn) -> int | None:
    tables = list_user_tables(conn)
    if "schema_migrations" not in tables:
        return None
    row = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
    if row is None or row[0] is None:
        return 0
    return int(row[0])
