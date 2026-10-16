# DukaanVoice AI - Database Schema Specification (Schema Version 4)

**Database Engine:** SQLite 3 via Python's standard library `sqlite3` module. No ORM.  
**Default Live Database Path:** `backend/data/dukaanvoice.db`  
**Current Schema Version:** `4` (`004_expenses_and_cash_closings`)

---

## 1. Accounting & Mathematical Invariants

### A. Money (Integer Paise)
All monetary amounts (`purchase_price`, `selling_price`, `unit_price`, `line_total`, `amount`, `credit_limit`, `balance_after`, `opening_cash`, `cash_sales`, `expected_cash`, `actual_cash`, `difference`) are stored as **INTEGER paise**.
- ₹1.00 = `100` paise
- ₹12.50 = `1250` paise
- Floating-point representations (`REAL`, `FLOAT`, `DOUBLE`) are strictly forbidden to eliminate rounding drift.

### B. Inventory Stock (Integer Milli-Units)
All stock quantities (`stock_qty`, `low_stock_threshold`, line item `quantity`, and inventory movements `quantity_change`, `stock_before`, `stock_after`) are stored as **INTEGER milli-units**.
- 1 standard unit = `1000` milli-units
- 2.5 kg = `2500` milli-units
- Count and weight items operate on the exact same auditable integer representation.

### C. Cash vs Digital Distinction
Physical cash drawer tracking (`cash_closings`) strictly isolates movements where `payment_method == 'cash'`. Digital receipts (UPI, Bank NEFT/RTGS) and credit transactions (Udhaar) never pollute physical drawer totals.

---

## 2. Table Catalog (10 Tables)

### 1. `schema_migrations`
Tracks monotonic migration version history.
```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. `products`
Shop inventory items. Supports quick product entry; SKU is optional for neighborhood retailers while non-empty SKUs remain strictly unique.
```sql
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sku TEXT,
    category TEXT NOT NULL DEFAULT '',
    stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price INTEGER NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_products_sku_unique ON products(sku) WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(active);
```

### 3. `unit_conversions`
Packaging conversions relative to product base units (e.g. 1 bag = 50 kg).
```sql
CREATE TABLE unit_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    from_unit TEXT NOT NULL CHECK (length(trim(from_unit)) > 0),
    to_unit TEXT NOT NULL CHECK (length(trim(to_unit)) > 0),
    factor INTEGER NOT NULL CHECK (factor > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, from_unit, to_unit),
    CHECK(from_unit != to_unit)
);
CREATE INDEX idx_unit_conversions_product ON unit_conversions(product_id);
```

### 4. `transactions`
Commercial transactions (Sales and Purchases). Supports state machine: `draft` -> `confirmed` -> `reversed`.
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('sale', 'purchase')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'reversed')),
    total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'credit')),
    customer_id INTEGER REFERENCES customers(id),
    original_instruction TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
    reversed_at TEXT
);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
```

### 5. `transaction_items`
Individual line items inside transactions.
```sql
CREATE TABLE transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0),
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    base_quantity INTEGER NOT NULL CHECK (base_quantity > 0)
);
CREATE INDEX idx_tx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_tx_items_product ON transaction_items(product_id);
```

### 6. `inventory_movements`
Immutable double-entry physical stock audit log.
```sql
CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    transaction_id INTEGER REFERENCES transactions(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'opening', 'sale', 'purchase', 'adjustment', 'reversal_in', 'reversal_out'
    )),
    quantity_change INTEGER NOT NULL,
    stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_movements_transaction ON inventory_movements(transaction_id);
CREATE INDEX idx_movements_created_at ON inventory_movements(created_at);
```

### 7. `customers`
Customer records for neighborhood Udhaar Khata.
```sql
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_active ON customers(active);
```

### 8. `customer_ledger`
Immutable debit/credit running ledger for customer balance derivations.
```sql
CREATE TABLE customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('credit_sale', 'payment', 'adjustment')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    balance_after INTEGER NOT NULL,
    payment_method TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customer_ledger_customer ON customer_ledger(customer_id);
CREATE INDEX idx_customer_ledger_transaction ON customer_ledger(transaction_id);
CREATE INDEX idx_customer_ledger_created ON customer_ledger(created_at);
```

### 9. `expenses`
Operational expense register classified by drawer cash, UPI, and bank transfer.
```sql
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_payment_method ON expenses(payment_method);
CREATE INDEX idx_expenses_status ON expenses(status);
```

### 10. `cash_closings`
Daily cash drawer reconciliation and finalization lock records.
```sql
CREATE TABLE cash_closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date TEXT NOT NULL UNIQUE,
    opening_cash INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
    cash_sales INTEGER NOT NULL DEFAULT 0 CHECK (cash_sales >= 0),
    cash_repayments INTEGER NOT NULL DEFAULT 0 CHECK (cash_repayments >= 0),
    cash_expenses INTEGER NOT NULL DEFAULT 0 CHECK (cash_expenses >= 0),
    cash_refunds INTEGER NOT NULL DEFAULT 0 CHECK (cash_refunds >= 0),
    expected_cash INTEGER NOT NULL,
    actual_cash INTEGER NOT NULL CHECK (actual_cash >= 0),
    difference INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
);
CREATE INDEX idx_cash_closings_date ON cash_closings(business_date);
CREATE INDEX idx_cash_closings_status ON cash_closings(status);
```
