# Release Notes - DukaanVoice AI

**Release Version:** v1.0.0 (Kirana Local-First Edition)  
**Release Date:** October 16, 2026  
**Target Audience:** Small Indian retail shops, kirana stores, provision merchants, and neighborhood dukandars.  

---

## What is DukaanVoice AI?

**DukaanVoice AI** is an ultra-fast, local-first retail register and inventory management system designed specifically for the unique operational workflows of Indian neighborhood shops. It combines simple, rapid POS billing with an integrated Customer Udhaar Khata (credit ledger), daily cash drawer reconciliation, expense tracking, and native multilingual support across all **22 Eighth Schedule Indian languages** plus English.

---

## Key Highlights in v1.0.0

### 1. Daily Cash Closing & Drawer Reconciliation
- **Drawer Math:** Computes `Expected Closing Cash = Opening Cash + Cash Sales + Cash Repayments - Cash Expenses - Cash Refunds`.
- **Physical Drawer Counting:** The shopkeeper enters the physical cash counted in the drawer at the end of the day.
- **Shortage / Excess Discrepancy Tracking:** Automatically calculates and visualizes any discrepancy with mandatory explanatory notes.
- **Audit Locking:** Finalizing a closing locks the record against accidental modification or retroactive ledger tampering while preserving complete historical logs.
- **Tender Discrimination:** Strictly separates physical cash from digital UPI receipts and credit sales so closing figures reflect physical drawer reality.

### 2. Comprehensive Expense Register
- **Categorized Outlays:** Track daily operating expenses across standard kirana categories (Shop Rent, Electricity, Transport, Staff Wages, Packaging, Tea/Refreshments, Maintenance, Miscellaneous).
- **Payment Method Classification:** Distinguish between cash-paid expenses (which reduce cash drawer balance) and bank/UPI transfers (which do not affect the physical cash drawer).
- **Auditable Compensating Reversals:** Expenses can be reversed with a recorded reason, maintaining a full audit log without destructive row deletion.

### 3. Customer Udhaar Khata & Statement Sharing
- **Credit Customer Ledger:** Track outstanding customer balances with debit/credit ledger derivation.
- **Credit Sales & Repayments:** Seamlessly record credit sales from the POS and collect repayments via Cash or UPI.
- **Customer Statement Modal:** Date-filtered statement displaying opening balance, transactions, repayments, and closing balance.
- **WhatsApp Share:** Generate pre-formatted, localized WhatsApp balance reminders that shopkeepers can review and copy with one click.
- **Printable Statements:** Clean print layout formatted for standard receipt or A4 printers.

### 4. Quick Sale POS
- **Fast Product Search:** Instant search by name or barcode/SKU with instant item addition.
- **Flexible Kirana Units:** Full support for count-based units (piece, packet, bottle) and weight-based units (kg, gram, litre, ml) with exact integer conversion.
- **Review Before Confirmation:** Clear review modal displaying line totals, tax, and tender selection before committing inventory changes.
- **Atomic Confirmation:** Inventory is deducted atomically upon confirmation using SQLite database transactions.
- **Thermal & A4 Receipts:** Instant printable receipts showing shop details, items, payment tender, and outstanding balances.

### 5. Multilingual Support (22 Scheduled Indian Languages + English)
- **Pan-India Coverage:** 100% UI translation coverage across all 22 Eighth Schedule languages:
  *Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, and Urdu.*
- **RTL Script Support:** Dynamic bidirectional layout engine for Perso-Arabic scripts (Urdu, Kashmiri, Sindhi) with flipped toolbars, navigation, and tables.
- **Zero Translation Gaps:** Fully validated automated test suite enforcing 100% key parity across all 23 language dictionaries.

### 6. Simplified Product Catalog with Optional SKU
- **Zero-Friction Product Entry:** Small retailers can add items with just a Product Name, Selling Price, and Opening Stock. SKU is strictly optional.
- **Non-Empty SKU Uniqueness:** When an SKU or barcode is supplied, uniqueness is enforced to prevent duplicate barcode scanning issues.

### 7. Financial & Inventory Accounting Integrity
- **Integer Paise Representation:** All money amounts are stored and calculated as integers in paise (`100 paise = ₹1.00`), eliminating floating-point rounding errors.
- **Integer Milli-Unit Stock:** Inventory quantities are stored as integer milli-units (`1000 milli-units = 1 base unit`).
- **Mathematical Continuity Reconciliation:** Built-in audit report verifying `Opening + Purchased - Sold ± Adjustments == Current Stock` for every item.

### 8. Windows Single-Click Launch
- **`run.bat` / `start.bat`:** One-click script that checks prerequisites, applies database migrations safely, launches the backend on `http://127.0.0.1:8000`, launches the frontend on `http://127.0.0.1:5173`, and opens the browser.
- **`stop.bat`:** Safely terminates the service process tree and releases ports 8000 and 5173.

---

## Upgrade & Migration Safety

- **Database Version:** Schema Version 4.
- **Additive Migration:** Upgrades from Version 1, 2, or 3 are completely additive and non-destructive.
- **Live Backup Protection:** Automated backup integration via SQLite Online Backup API ensures user data remains safe before any schema or system update.
