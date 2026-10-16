# Database schema (Phase 1)

Engine: SQLite 3 via Python's `sqlite3` module. No ORM.

Default live file: `backend/data/dukaanvoice.db`  
This directory is application data, not a temp folder and not the frontend build output.

## Conventions

### Money (paise)

`purchase_price`, `selling_price`, `unit_price`, and `line_total` are **INTEGER paise**.

- ₹1.00 = `100`
- ₹12.50 = `1250`

Do not store currency as REAL/float.

### Stock and units (milli-units)

`stock_qty`, `low_stock_threshold`, transaction `quantity`, and inventory `quantity_change` / `stock_before` / `stock_after` are **INTEGER milli-units**.

- 1 unit of the stated unit = `1000` milli-units
- 2.5 kg with `base_unit = kg` is stored as `2500`

Product `stock_qty` is always in the product **base unit**.

Transaction line `quantity` stays in the line's original `unit`. Conversion into the base unit is allowed later only through a matching `unit_conversions` row. Phase 1 does not post stock movements.

### Conversion factor

`unit_conversions.factor` is an INTEGER: how many milli-units of `to_unit` equal **one** `from_unit`.

Example: 1 box = 24 pieces → `from_unit = box`, `to_unit = piece`, `factor = 24000`.

`from_unit` and `to_unit` must differ.

## Tables

### schema_migrations

| Column | Type | Notes |
| --- | --- | --- |
| version | INTEGER PK | Monotonic schema version |
| name | TEXT NOT NULL | Migration name |
| applied_at | TEXT | UTC timestamp from SQLite `datetime('now')` |

Current application version: **1** (`001_initial_foundation`).

### products

| Column | Type | Constraints |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY |
| name | TEXT | NOT NULL, non-empty |
| sku | TEXT | NOT NULL, UNIQUE, non-empty |
| category | TEXT | NOT NULL default `''` |
| stock_qty | INTEGER | NOT NULL default 0, `>= 0`, milli-units of `base_unit` |
| base_unit | TEXT | NOT NULL, non-empty |
| purchase_price | INTEGER | NOT NULL default 0, `>= 0`, paise |
| selling_price | INTEGER | NOT NULL default 0, `>= 0`, paise |
| low_stock_threshold | INTEGER | NOT NULL default 0, `>= 0`, milli-units |
| active | INTEGER | NOT NULL default 1, `0` or `1` |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

### unit_conversions

| Column | Type | Constraints |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY |
| product_id | INTEGER | NOT NULL, FK → products(id) |
| from_unit | TEXT | NOT NULL |
| to_unit | TEXT | NOT NULL |
| factor | INTEGER | NOT NULL, `> 0` |

UNIQUE `(product_id, from_unit, to_unit)`.

### transactions

| Column | Type | Constraints |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY |
| type | TEXT | `sale` or `purchase` |
| status | TEXT | `draft`, `confirmed`, or `reversed` (default `draft`) |
| idempotency_key | TEXT | UNIQUE (multiple NULLs allowed) |
| original_instruction | TEXT | NOT NULL default `''` |
| created_at | TEXT | NOT NULL |
| confirmed_at | TEXT | nullable |

Phase 3 implements sales and purchase transaction drafts, atomic confirmation, and auditable reversals.

### transaction_items

| Column | Type | Constraints |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY |
| transaction_id | INTEGER | NOT NULL, FK → transactions(id) |
| product_id | INTEGER | NOT NULL, FK → products(id) |
| quantity | INTEGER | `> 0`, milli-units of `unit` |
| unit | TEXT | NOT NULL |
| unit_price | INTEGER | `>= 0`, paise |
| line_total | INTEGER | `>= 0`, paise |

### inventory_movements

| Column | Type | Constraints |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY |
| product_id | INTEGER | NOT NULL, FK → products(id) |
| transaction_id | INTEGER | nullable FK → transactions(id) |
| movement_type | TEXT | `sale`, `purchase`, `adjustment`, `reversal` |
| quantity_change | INTEGER | `<> 0`, milli-units of product base unit |
| stock_before | INTEGER | `>= 0` |
| stock_after | INTEGER | `>= 0` |
| created_at | TEXT | NOT NULL |

Phase 3 activates this table as an auditable ledger: initial adjustments on opening stock, sales deductions, purchase additions, and compensating movements on transaction reversals. Historical movements are never deleted or modified.

## Indexes

- products: sku, active, category
- unit_conversions: product_id
- transactions: (type, status), created_at
- transaction_items: transaction_id, product_id
- inventory_movements: product_id, transaction_id

## Foreign keys

Every connection executes `PRAGMA foreign_keys = ON`.

## Initialization and migrations

Command:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m app.cli init-db
```

Rules:

1. If the database file does not exist, create it and apply version 1 in one connection commit.
2. If the file exists and already has `schema_migrations` at version 1, do nothing destructive. Data remains.
3. If the file exists with user tables but **no** `schema_migrations`, stop. Do not drop, recreate, or guess a conversion from an unknown schema.
4. If the recorded version is newer or older than the application, stop and require an explicit migration.
5. Tables are never dropped automatically. Databases are never deleted automatically.

### How to add schema version 2 later

1. Backup first (`python -m app.cli backup`).
2. Add `MIGRATION_002_STATEMENTS` that only use `ALTER TABLE ... ADD COLUMN`, new tables, or new indexes.
3. Raise `SCHEMA_VERSION` to 2.
4. Apply inside a single connection so a failed migration rolls back.
5. Never use `DROP TABLE` in a default migration.
6. Add tests that start from a version 1 file and upgrade.

## Runtime

`GET /api/health` does not open the database.

`GET /api/health/ready` opens the live file **read-only**, runs `SELECT 1`, and checks that schema version 1 and required tables are present. It does not create a database.
