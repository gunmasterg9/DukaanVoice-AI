# DukaanVoice AI
**Smart Multilingual POS & Ledger for Indian Kirana & Neighborhood Retailers**

DukaanVoice AI is an ultra-fast, local-first retail register, inventory management, and credit ledger system designed specifically for the daily operational workflows of Indian neighborhood shops (kirana, provision, general stores).

It empowers retailers to manage sales, customer credit (*Udhaar Khata*), daily cash drawer reconciliation, operating expenses, and inventory audits in their own mother tongue across **all 22 constitutionally scheduled Indian languages** plus English.

---

## 🌟 Key Features

### 🛒 1. Quick Sale POS
- **Rapid Item Search:** Instant product lookup by name or barcode/SKU with instant cart additions.
- **Kirana-Friendly Units:** Full support for count-based units (*piece, packet, bottle*) and weight/volume units (*kg, gram, litre, ml*) with exact integer conversion.
- **Review Guardrail:** Clear confirmation modal displaying line items, quantities, and totals before committing inventory.
- **Multi-Tender Payments:** Record tender as **Cash**, **UPI** (cashier-recorded digital receipt), or **Credit (Udhaar)**.
- **Atomic Confirmation:** Inventory is deducted atomically upon confirmation using SQLite database transactions.
- **Thermal Receipts:** Print-ready 80mm POS and A4 receipts showing shop branding, tax, and customer balances.

### 📖 2. Customer Udhaar Khata (Credit Ledger)
- **Customer Balance Tracking:** Outstanding balances derived from immutable transaction ledger rows.
- **Credit Sales & Repayments:** Directly record credit sales from POS and collect partial/full repayments via Cash or UPI.
- **Customer Statements:** Date-filtered statement breakdown showing opening balance, debits, credits, and closing balance.
- **WhatsApp-Ready Sharing:** One-click copy for pre-formatted, localized WhatsApp balance reminders to send to customers.
- **Printable Statements:** Clean print layout for formal customer billing records.

### 💵 3. Daily Cash Closing & Drawer Reconciliation
- **Drawer Balance Calculation:**
  $$\text{Expected Closing Cash} = \text{Opening Cash} + \text{Cash Sales} + \text{Cash Repayments} - \text{Cash Expenses} - \text{Cash Refunds}$$
- **Physical Cash Counting:** Enter actual physical currency counted in the cash drawer.
- **Difference Tracking:** Visual indicators for balanced, surplus, or shortage drawers with required explanatory notes.
- **Audit Locking:** Finalize and permanently lock the day's closing record to prevent retroactive tampering.
- **Strict Cash Boundary:** Excludes UPI and credit sales from physical drawer calculations.

### 📊 4. Shop Expense Register
- **Categorized Outlays:** Track daily operating expenses (Shop Rent, Electricity, Transport, Staff Wages, Packaging, Tea/Refreshments, Maintenance, Miscellaneous).
- **Payment Method Classification:** Distinguishes cash-paid outlays (drawer-affecting) from bank transfers/UPI.
- **Compensating Reversals:** Auditable reversal mechanism that preserves complete historical ledger records.

### 🌐 5. True Pan-India Multilingual Support (22 Scheduled Languages + English)
- **100% Key Parity:** Full UI coverage across English and all 22 Eighth Schedule Indian languages:
  *Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, and Urdu.*
- **RTL Script Support:** Bidirectional horizontal mirroring for Perso-Arabic scripts (*Urdu, Kashmiri, Sindhi*).
- **Graceful Fallback:** Automatically falls back to English for any missing translation key without crashing.

### 📦 6. Simplified Product Catalog with Optional SKU
- **Zero-Friction Entry:** Products only require a Name, Selling Price, and Opening Stock. SKU is strictly optional.
- **Barcode Compatibility:** If an SKU/barcode is entered, uniqueness is strictly enforced.
- **Stock Audit Movements:** Every inventory change is recorded in an immutable `inventory_movements` log.

### 🔒 7. Financial & Inventory Accounting Integrity
- **Integer Paise Representation:** All money amounts are stored and calculated as integers in paise (`100 paise = ₹1.00`), eliminating floating-point rounding errors.
- **Integer Milli-Unit Stock:** Inventory quantities are stored as integer milli-units (`1000 milli-units = 1 base unit`).
- **Mathematical Continuity Reconciliation:** Built-in audit report verifying $\text{Opening} + \text{Purchased} - \text{Sold} \pm \text{Adjustments} = \text{Current Stock}$ for every single item.

---

## 🏛️ Supported Indian Languages (8th Schedule)

| # | Code | Language | Native Name | Script | Direction | Primary Region |
|---|---|---|---|---|---|---|
| 1 | `gu` | Gujarati (Default) | ગુજરાતી | Gujarati | LTR | Gujarat |
| 2 | `hi` | Hindi | हिन्दी | Devanagari | LTR | North & Central India |
| 3 | `en` | English (Fallback) | English | Latin | LTR | Pan-India / Global |
| 4 | `as` | Assamese | অসমীয়া | Bengali-Assamese | LTR | Assam |
| 5 | `bn` | Bengali | বাংলা | Bengali | LTR | West Bengal, Tripura |
| 6 | `brx` | Bodo | बड़ो | Devanagari | LTR | Bodoland / Assam |
| 7 | `doi` | Dogri | डोगरी | Devanagari | LTR | Jammu & Kashmir |
| 8 | `kn` | Kannada | ಕನ್ನಡ | Kannada | LTR | Karnataka |
| 9 | `ks` | Kashmiri | کٲشُر | Perso-Arabic | **RTL** | Kashmir Valley |
| 10 | `kok` | Konkani | कोंकणी | Devanagari | LTR | Goa, Coastal Maharashtra |
| 11 | `mai` | Maithili | मैथिली | Devanagari | LTR | Bihar, Jharkhand |
| 12 | `ml` | Malayalam | മലയാളം | Malayalam | LTR | Kerala, Lakshadweep |
| 13 | `mni` | Manipuri (Meitei) | মৈতৈলোন্ | Bengali | LTR | Manipur |
| 14 | `mr` | Marathi | मराठी | Devanagari | LTR | Maharashtra |
| 15 | `ne` | Nepali | नेपाली | Devanagari | LTR | Sikkim, West Bengal |
| 16 | `or` | Odia | ଓଡ଼ିଆ | Odia | LTR | Odisha |
| 17 | `pa` | Punjabi | ਪੰਜਾਬੀ | Gurmukhi | LTR | Punjab |
| 18 | `sa` | Sanskrit | संस्कृतम् | Devanagari | LTR | Classical / Pan-India |
| 19 | `sat` | Santali | ᱥᱟᱱᱛᱟᱲᱤ | Ol Chiki | LTR | Jharkhand, West Bengal, Odisha |
| 20 | `sd` | Sindhi | سنڌي | Perso-Arabic | **RTL** | Western India / Sindh diaspora |
| 21 | `ta` | Tamil | தமிழ் | Tamil | LTR | Tamil Nadu, Puducherry |
| 22 | `te` | Telugu | తెలుగు | Telugu | LTR | Andhra Pradesh, Telangana |
| 23 | `ur` | Urdu | اُردُو | Perso-Arabic | **RTL** | Pan-India / J&K, Telangana, UP |

---

## 💻 Tech Stack & Architecture

- **Frontend:** React 18, Vite 6, Vanilla CSS (dynamic dark/light design system with HSL tokens, glassmorphism, RTL engine).
- **Backend:** FastAPI, Python 3.12, Pydantic v2, Uvicorn.
- **Database:** SQLite 3 (WAL mode, parameterized SQL, Schema Version 4).
- **Operating System:** Windows 10/11 local-first workstation.
- **Default Local URLs:**
  - Frontend: `http://127.0.0.1:5173`
  - Backend API: `http://127.0.0.1:8000` (Interactive docs: `http://127.0.0.1:8000/docs`)
- **Database Storage Path:** `backend/data/dukaanvoice.db`

---

## 🚀 Quick Start (Windows Single-Click)

The simplest way to start and stop DukaanVoice AI on Windows:

1. **Start the application:**  
   Double-click `run.bat` (or `start.bat`).  
   - Automatically validates Python and Node.js prerequisites.
   - Non-destructively runs schema migrations if needed.
   - Starts the FastAPI backend on port 8000 and Vite frontend on port 5173.
   - Automatically opens `http://127.0.0.1:5173` in your default browser.

2. **Stop the application:**  
   Double-click `stop.bat`.  
   - Terminates the background service process tree.
   - Frees ports 8000 and 5173 cleanly.

---

## 🛠️ Manual Installation & Launch

### Prerequisites
- Python 3.12+
- Node.js 20+ (with `npm.cmd` on Windows)

### 1. Backend Setup
```powershell
cd "backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.cli init-db
```

### 2. Frontend Setup
```powershell
cd "..\frontend"
npm.cmd install
Copy-Item .env.example .env
```

### 3. Launch Services (Two Terminals)
- **Terminal 1 (Backend):**
  ```powershell
  cd "backend"
  .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  ```
- **Terminal 2 (Frontend):**
  ```powershell
  cd "frontend"
  npm.cmd run dev
  ```

---

## 🧪 Automated Testing & Verification

DukaanVoice AI includes comprehensive test suites across backend, frontend, and static analysis:

```powershell
# 1. Backend test suite (70 tests - 100% pass)
cd backend
.\.venv\Scripts\pytest.exe -v

# 2. Frontend i18n & translation parity tests (49 tests - 100% pass)
cd ..\frontend
npm.cmd test

# 3. Frontend static analysis & linting (0 warnings, 0 errors)
npx.cmd oxlint

# 4. Production build compilation (529ms)
npm.cmd run build

# 5. Full 10-step shop lifecycle simulation
python ..\scratch\e2e_verification.py
```

---

## 📁 Project Structure

```
DukaanVoice AI/
├── backend/
│   ├── app/
│   │   ├── database.py         # SQLite connection & WAL configuration
│   │   ├── main.py             # FastAPI app initialization & router registration
│   │   ├── schema.py           # Additive Schema v1 -> v4 migration engine
│   │   ├── routers/
│   │   │   ├── cash_closing.py # Daily cash closing & reconciliation endpoints
│   │   │   ├── customers.py    # Customer Udhaar Khata & statement endpoints
│   │   │   ├── expenses.py     # Expense register & category summary endpoints
│   │   │   ├── products.py     # Product CRUD & stock adjustment endpoints
│   │   │   ├── reports.py      # Business reports & mathematical reconciliation
│   │   │   └── transactions.py # POS sales, purchase drafts & atomic confirmation
│   │   └── schemas/            # Pydantic v2 request/response models
│   ├── data/                   # Local SQLite storage (dukaanvoice.db)
│   ├── backups/                # Non-blocking SQLite online backup files
│   └── tests/                  # 70 Pytest unit and integration tests
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Top-level navigation & tab layout
│   │   ├── index.css           # Modern design system, HSL tokens, dark mode, RTL
│   │   ├── components/
│   │   │   ├── CashClosing.jsx # Cash drawer reconciliation & locking UI
│   │   │   ├── Expenses.jsx    # Expense entry, filtering, and reversal UI
│   │   │   ├── QuickSale.jsx   # Fast POS billing, cart, and thermal receipts
│   │   │   ├── UdhaarKhata.jsx # Customer credit, repayments, statement & WhatsApp
│   │   │   ├── Products.jsx    # Catalog management with optional SKU
│   │   │   └── Reports.jsx     # Sales analytics & inventory reconciliation
│   │   ├── i18n/               # 23 Translation dictionaries & language selector
│   │   └── services/           # Axios API client & command parser
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── FINAL_QA_REPORT.md      # Comprehensive QA audit, metrics, and sign-off
│   ├── RELEASE_NOTES.md        # Feature highlights and release details
│   ├── KNOWN_LIMITATIONS.md    # Transparent documentation of operational limits
│   ├── DEMO_SCRIPT.md          # 5-minute step-by-step evaluator walkthrough
│   ├── DATABASE_SCHEMA.md      # Schema v4 documentation and table definitions
│   └── BACKUP_RESTORE.md       # Backup and disaster recovery procedures
├── run.bat                     # Windows one-click start script
├── start.bat                   # Alias for run.bat
└── stop.bat                    # Windows one-click stop script
```

---

## 🔒 Security & Data Safety Principles

1. **Zero Cloud Requirement:** Designed as a self-contained local-first application. No shop data is sent to external cloud servers.
2. **Local Host Bounding:** FastAPI binds exclusively to `127.0.0.1` by default; it is not exposed to external public networks without explicit configuration.
3. **Audit Trails & Compensating Reversals:** Transactions and expenses cannot be hard-deleted; reversals create explicit compensating records to preserve historical integrity.
4. **Closing Lock:** Finalized daily cash closings are permanently locked against tampering.
5. **Database Backups:** Safe online backups can be created at any time without locking active retail transactions (`docs/BACKUP_RESTORE.md`).

---

## 📜 Documentation Links
- [Final QA Report](docs/FINAL_QA_REPORT.md)
- [Release Notes](docs/RELEASE_NOTES.md)
- [Known Limitations](docs/KNOWN_LIMITATIONS.md)
- [Evaluator Demo Script](docs/DEMO_SCRIPT.md)
- [Database Schema v4](docs/DATABASE_SCHEMA.md)
- [Backup & Restore Guide](docs/BACKUP_RESTORE.md)
