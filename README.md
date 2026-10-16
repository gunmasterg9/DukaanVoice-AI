# DukaanVoice AI
**Gujarati-First Smart Shop Register**

DukaanVoice AI is a local-first shop management application designed to simplify inventory and transaction management for small retailers.

**Project goal:** Make reliable digital shop management more accessible to small Indian retailers through a simple, Gujarati-first experience.

### Key Features
- **Product Management:** Product registration, SKU uniqueness, search, category filtering, and stock management.
- **Sales & Purchase Workflows:** Draft creation with live line estimation and explicit atomic confirmation.
- **Inventory Ledger:** Automatic inventory updates and auditable stock movements (`inventory_movements`).
- **Data Safety:** Transaction reversal safeguards, idempotency protection, and unit conversion support.
- **Business Reports:** Daily sales and purchase expenditure breakdown.
- **Product Analytics:** Product-wise sales analysis in base units and inventory valuation (cost & selling value).
- **Inventory Reconciliation:** Mathematical stock ledger reconciliation to identify stock discrepancies and audit gaps.
- **Full-Stack Architecture:** React + Vite frontend with FastAPI backend and SQLite database.

### Implementation Status
- **Phase 1 (Foundation):** Safe SQLite schema v1, FastAPI health/readiness checks, backup/restore CLI.
- **Phase 2 (Product Catalog):** Complete product CRUD, unit conversions, and low-stock indicators.
- **Phase 3 (Transactions):** Sales and purchase drafts, atomic confirmation, and compensating reversals.
- **Phase 4 (Reports & Reconciliation):** Daily sales analytics, purchase ledger, inventory valuation, and mathematical ledger continuity reconciliation.

### Technology Stack
- **Frontend:** React 19, Vite, Vanilla CSS design system.
- **Backend:** Python 3.12, FastAPI, SQLite (standard library `sqlite3`), Pydantic validation.
- **Testing:** Pytest for backend, Node test runner for frontend, Oxlint for linting.

### Future Scope
Gujarati, Hindi, and English AI-assisted text and voice interactions are planned future capabilities and should not be considered complete unless separately implemented and verified.

## Layout

- `backend/` — FastAPI application (`app/`), tests, virtual environment
- `frontend/` — React + Vite UI
- `docs/` — schema and backup documentation
- Shop data default path: `backend/data/dukaanvoice.db`

## Prerequisites (Windows PowerShell)

- Python 3.12
- Node.js 24 and `npm.cmd` (use the `.cmd` shims if PowerShell blocks `.ps1` scripts)
- Do not change the PowerShell execution policy for this project

## Backend setup

Run these from the repository root, or `cd` into `backend` as shown.

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.cli init-db
```

Direct dependencies (pinned in `requirements.txt`):

| Package | Version |
| --- | --- |
| fastapi | 0.143.0 |
| uvicorn[standard] | 0.54.0 |
| pydantic | 2.14.1 |
| python-dotenv | 1.1.1 |
| pytest | 8.4.2 |
| httpx | 0.28.1 |

httpx is included because FastAPI's `TestClient` requires it.

## Frontend setup

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd install
Copy-Item .env.example .env
```

During development the Vite proxy forwards `/api` to `http://127.0.0.1:8000`. Optional `VITE_API_BASE_URL` is documented in `frontend/.env.example`.

Frontend direct dependencies: React 19.2.x and react-dom 19.2.x. Dev tools: Vite 8.x, `@vitejs/plugin-react`, oxlint.

## Quick start (Windows Batch Files)

You can launch and stop both backend and frontend using the one-click batch scripts in the project root:

- **Start application:** Double-click `run.bat` (or `start.bat`).
  - Verifies Python virtual environment and installs/checks configuration and dependencies.
  - Automatically initializes the database if first run.
  - Launches Backend API on `http://127.0.0.1:8000` (docs at `/docs`).
  - Launches Frontend UI on `http://127.0.0.1:5173`.
  - Automatically opens the web app in your default browser.
- **Stop application:** Double-click `stop.bat`.
  - Gracefully closes DukaanVoice terminal windows and child processes.
  - Checks and frees ports 8000 and 5173.

## Manual run (two PowerShell terminals)

Terminal 1 — API on localhost only:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — UI:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Confirm `GET http://127.0.0.1:8000/api/health` and `GET http://127.0.0.1:8000/api/health/ready`.

## Tests and build

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m pytest

cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd test
npm.cmd run build
```

Backend tests create temporary database files only. They do not write to `backend/data/dukaanvoice.db`.

## Backup and restore

See `docs/BACKUP_RESTORE.md`. Quick commands:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m app.cli backup
.\.venv\Scripts\python.exe -m app.cli restore --backup "backups\dukaanvoice-YYYYMMDDTHHMMSSZ.db" --destination "data\dukaanvoice-restored.db"
```

Restore always writes a **new** file. It will not overwrite the live database.

## API endpoints (Phase 1 & Phase 2)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service liveness check |
| `GET` | `/api/health/ready` | SQLite connection and schema check |
| `POST` | `/api/products` | Create product with opening stock |
| `GET` | `/api/products` | List & search products (query, category, low stock, pagination) |
| `GET` | `/api/products/{id}` | Get product details & unit conversions |
| `PUT` | `/api/products/{id}` | Edit product details (preserves stock audit) |
| `PATCH` | `/api/products/{id}/deactivate` | Deactivate product (non-destructive) |
| `PATCH` | `/api/products/{id}/reactivate` | Reactivate product |
| `GET` | `/api/products/{id}/conversions` | List product unit conversions |
| `POST` | `/api/products/{id}/conversions` | Add explicit unit conversion rule |
| `PUT` | `/api/products/{id}/conversions/{cid}` | Update unit conversion rule |
| `DELETE` | `/api/products/{id}/conversions/{cid}` | Remove unit conversion rule |
| `POST` | `/api/transactions` | Create sales or purchase draft (idempotent, no stock change) |
| `GET` | `/api/transactions` | List & filter transactions (type, status, date, product) |
| `GET` | `/api/transactions/{id}` | Get transaction details and inventory movements |
| `PATCH` | `/api/transactions/{id}/confirm` | Atomically confirm draft & post inventory movements |
| `POST` | `/api/transactions/{id}/reverse` | Atomically reverse transaction & post compensating movements |
| `GET` | `/api/reports/sales/daily` | Daily sales aggregation, net revenue, and reversal breakdown |
| `GET` | `/api/reports/purchases` | Purchase ledger, net expenditure, and reversal breakdown |
| `GET` | `/api/reports/products` | Product sales in base units, line values, and reversals |
| `GET` | `/api/reports/inventory` | Inventory valuation at cost/sell prices, stock levels & flows |
| `GET` | `/api/reports/reconciliation` | Mathematical stock reconciliation and audit chain checks |
| `GET` | `/api/reports/inventory/movements` | Chronological paginated inventory movement audit records |

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DUKAANVOICE_HOST` | Bind address | `127.0.0.1` |
| `DUKAANVOICE_PORT` | Bind port | `8000` |
| `DUKAANVOICE_DATA_DIR` | Application data directory | `backend/data` |
| `DUKAANVOICE_DATABASE_PATH` | SQLite file | `backend/data/dukaanvoice.db` |
| `DUKAANVOICE_BACKUP_DIR` | Backup directory | `backend/backups` |
| `DUKAANVOICE_CORS_ORIGINS` | Allowed browser origins | Vite localhost origins |
| `VITE_API_BASE_URL` | Optional frontend API prefix | `/api` via proxy |

Keep `.env` files out of Git.

## Safety rules (Phase 1)

- The API binds to `127.0.0.1` by default and is not shared on the LAN.
- CORS is limited to the configured development origins.
- Schema initialization never drops tables or deletes a database file.
- SQL used by the app is parameterized. There is no AI layer and no generated SQL.
- Ollama is not required and is not contacted at startup or in health checks.

## Schema

See `docs/DATABASE_SCHEMA.md`.
