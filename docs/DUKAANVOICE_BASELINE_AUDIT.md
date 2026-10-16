# DukaanVoice AI — Phase 0 Baseline Audit

**Audit date:** 2026-10-16  
**Auditor:** Antigravity AI (Phase 0 — no code modifications made)

---

## 1. Repository State

### 1.1 Directory contents

| Item | Observation |
|------|-------------|
| Workspace path | `c:\Users\RAHUL\Desktop\gautam\DukaanVoice AI` |
| Contents | **Empty directory** — no files, no subdirectories (before this audit) |
| Git repository | **Not initialised** — `git status` returns "fatal: not a git repository" |
| Existing database | **None** |
| Existing frontend / backend | **None** |
| Existing tests | **None** |
| Documentation | **None** |
| Configuration / dependency files | **None** |
| `.env` or secrets | **None** |

### 1.2 Conclusion

This is a **greenfield project**. There is no existing application, database, data, or Git history to preserve or conflict with. DukaanVoice AI can be built here from scratch without risk to any pre-existing system.

### 1.3 Parent directory context

The parent directory `c:\Users\RAHUL\Desktop\gautam\` contains unrelated projects (JalRakshak-Garden-AI, tradesathi-ai, LinkedIn-Post-Generator, etc.) and assorted files. The `DukaanVoice AI` folder is isolated and purpose-created for this project.

---

## 2. Environment Inventory

### 2.1 Operating system

| Property | Value |
|----------|-------|
| OS | Microsoft Windows 10 Home Single Language |
| Architecture | x64-based PC |
| Total RAM | 8,026 MB |
| Available RAM at audit time | **263 MB** (critically low) |
| Disk (C: drive) used | ~115.8 GB |
| Disk (C: drive) free | ~121.9 GB |

### 2.2 Runtime versions

| Tool | Version | Status |
|------|---------|--------|
| Python | 3.12.10 | ✅ Installed |
| pip | 26.2.1 | ✅ Installed |
| venv module | available | ✅ Built-in |
| Node.js | v24.21.0 | ✅ Installed |
| npm (via `npm.cmd`) | 11.19.0 | ✅ Works via `npm.cmd` |
| npm (via `npm`) | ❌ Blocked | PowerShell execution policy blocks `.ps1` shim |
| npx (via `npx.cmd`) | 11.19.0 | ✅ Works |
| Git | 2.55.0.windows.5 | ✅ Installed |

### 2.3 PowerShell execution policy

All scopes report `Undefined`, which defaults to `Restricted`. This blocks `.ps1` script shims but does not affect `.cmd` shims. **Workaround:** use `npm.cmd` and `npx.cmd` instead of `npm` and `npx`.

### 2.4 Python packages — globally installed

| Package | Version | Notes |
|---------|---------|-------|
| FastAPI | 0.143.0 | ✅ Available |
| Uvicorn | 0.54.0 | ✅ Available |
| Pydantic | 2.14.1 | ✅ Available |
| httpx | 0.28.1 | ✅ Available |
| requests | 2.34.2 | ✅ Available |
| pytest | 8.4.2 | ✅ Available |
| sqlite3 (stdlib) | 3.49.1 | ✅ Built-in |

### 2.5 Python packages — NOT installed

| Package | Status |
|---------|--------|
| SQLAlchemy | ❌ Not installed |
| Alembic | ❌ Not installed |
| aiosqlite | ❌ Not installed |
| ollama (Python SDK) | ❌ Not installed |

### 2.6 GPU

| Property | Value |
|----------|-------|
| nvidia-smi | ❌ Not found |
| GPU acceleration | **Not available** — all Ollama inference runs on CPU |

---

## 3. Ollama Assessment

### 3.1 Ollama availability

| Property | Value |
|----------|-------|
| Ollama CLI | ✅ Installed and running |
| Ollama server | ✅ Running (PID 4968, ~12.4 MB working set) |
| API endpoint | `http://localhost:11434` |
| API `/api/tags` | ✅ Responded with model list |

### 3.2 Installed models

| Model | Parameters | Size | Quantization | Context Length | Capabilities |
|-------|-----------|------|-------------|---------------|-------------|
| `qwen2.5:7b` | 7.6B | 4.7 GB | Q4_K_M | 32,768 | completion, tools |
| `llama3.2:latest` | 3.2B | 2.0 GB | Q4_K_M | 131,072 | completion, tools |

### 3.3 Runtime status at audit time

```
NAME          SIZE      PROCESSOR    CONTEXT    RUNNER
qwen2.5:7b   5.1 GB    100% CPU     4096       llamacpp
```

- The qwen2.5:7b model was loaded in memory, consuming ~5.1 GB.
- Running at **100% CPU** (no GPU offload).
- With only 263 MB free RAM, the system is heavily swapping.

### 3.4 Multilingual capability test

**Test attempted:** Send Gujarati text `"પાંચ પેકેટ બિસ્કીટ વેચ્યા"` (meaning "Sold five packets of biscuits") to `qwen2.5:7b` for translation.

**Result:** `httpx.ReadTimeout` after 60 seconds. The model could not return a response within the timeout — almost certainly due to the extreme memory pressure (8 GB total, 5.1 GB model, 263 MB free, CPU-only inference).

### 3.5 Model recommendation

| Criterion | qwen2.5:7b | llama3.2:latest |
|-----------|-----------|----------------|
| Size in RAM | ~5.1 GB | ~2.0 GB |
| Multilingual (Gujarati/Hindi) | Strong (Qwen2 trained on multilingual data) | Limited (primarily English + common languages) |
| Feasibility on this hardware | ⚠️ Marginal — causes severe swapping | ✅ More feasible — leaves headroom for OS + app |
| Structured output support | tools capability | tools capability |

**Recommendation:** Use `llama3.2:latest` as the primary model for development to avoid memory pressure. Test `qwen2.5:7b` for multilingual accuracy only when sufficient memory is available (close other applications). Gujarati support will need validation with both models.

> **⚠️ CRITICAL WARNING:** With only 8 GB RAM, no GPU, and CPU-only inference, LLM response times will be in the range of 30–120+ seconds per request. This is a fundamental hardware constraint that affects user experience but does not block development. The application architecture should include appropriate timeouts, loading states, and the ability to cancel long-running requests.

---

## 4. Database Assessment

### 4.1 Current state

- **No database exists.** The workspace is empty.
- SQLite 3.49.1 is available via Python's built-in `sqlite3` module.
- SQLAlchemy and Alembic are **not installed** (will need installation for ORM/migration support, or we can use raw SQLite for simplicity).

### 4.2 Backup and restore

- No backup/restore procedures exist (nothing to back up yet).
- Will be designed as part of Phase 1.

---

## 5. Security and Risk Assessment

### 5.1 Risks identified

| Risk | Severity | Mitigation |
|------|----------|------------|
| No Git repository | Medium | Initialise Git before any code changes |
| No virtual environment | Medium | Create a venv to isolate Python dependencies |
| Global Python packages | Low | Use venv; do not modify global installs |
| PowerShell execution policy blocks npm/npx | Low | Use `.cmd` variants consistently |
| Extremely low available RAM (263 MB) | High | Close unnecessary applications; use smaller model; add loading states |
| No GPU — CPU-only LLM inference | High | Use llama3.2 (3.2B) instead of qwen2.5 (7.6B) for development |
| No `.gitignore` | Low | Create before first commit |
| No `.env` for secrets | Low | Create `.env` template; add to `.gitignore` |
| Parent directory contains unrelated files | Low | The workspace folder is isolated; no cross-contamination risk |

### 5.2 Data-loss risks

- **None currently** — there is no data to lose.
- Once a database is created, all write operations must use transactions with proper rollback.
- Backup procedures must be documented before going to production.

### 5.3 Conflicts with existing functionality

- **None** — the workspace is empty and isolated from sibling projects.

---

## 6. Commands Executed During Audit

All commands were read-only inspections. No files were created, modified, or deleted (except this audit document and the `docs/` directory).

| # | Command | Purpose | Result |
|---|---------|---------|--------|
| 1 | `git status` | Check for existing repo | Not a git repository |
| 2 | `python --version` | Python version | 3.12.10 |
| 3 | `node --version` | Node.js version | v24.21.0 |
| 4 | `npm --version` | npm version (PS1) | Blocked by execution policy |
| 5 | `npm.cmd --version` | npm version (CMD) | 11.19.0 |
| 6 | `npx.cmd --version` | npx version | 11.19.0 |
| 7 | `pip --version` | pip version | 26.2.1 |
| 8 | `ollama list` | List installed models | qwen2.5:7b, llama3.2:latest |
| 9 | `ollama show qwen2.5:7b` | Model details | 7.6B, Q4_K_M, 32K context |
| 10 | `ollama show llama3.2:latest` | Model details | 3.2B, Q4_K_M, 131K context |
| 11 | `ollama ps` | Running models | qwen2.5:7b loaded, 100% CPU |
| 12 | `Invoke-WebRequest /api/tags` | Ollama API health | Responded with model JSON |
| 13 | `httpx.post /api/generate` | Gujarati translation test | Timed out (60s) |
| 14 | `Get-ExecutionPolicy -List` | PS execution policy | All scopes Undefined |
| 15 | `systeminfo` | RAM and OS | 8 GB RAM, 263 MB free, Win10 Home |
| 16 | `Get-PSDrive C` | Disk space | ~122 GB free |
| 17 | `nvidia-smi` | GPU check | Not found (no GPU) |
| 18 | `Get-Process ollama*` | Process status | Running (PID 4968) |
| 19 | Various `python -c "import ..."` | Package availability | See Section 2.4-2.5 |

---

## 7. Assumptions

1. The user intends this to be a **new, standalone project** in the `DukaanVoice AI` folder.
2. We may install Python packages into a **virtual environment** (not globally) after approval.
3. We may install Node.js packages via `npm.cmd install` for the Vite/React frontend after approval.
4. The `llama3.2:latest` model will be used for development; `qwen2.5:7b` for multilingual validation when memory allows.
5. SQLite is the database (no external database server needed).
6. The application is **local-first** — no cloud services, no external APIs beyond the local Ollama instance.
7. All `npm`/`npx` commands will use the `.cmd` variants to work around execution policy restrictions.

---

## 8. Blockers

| # | Blocker | Severity | Resolution |
|---|---------|----------|------------|
| B1 | **No virtual environment** — Python dependencies must be installed | Must resolve in Phase 1 | Create venv; install dependencies from `requirements.txt` |
| B2 | **No Git repository** — no version control safety net | Must resolve in Phase 1 | `git init`; create `.gitignore`; initial commit |
| B3 | **Extremely low RAM** — LLM inference times out | High but non-blocking | Use `llama3.2` (2 GB) instead of `qwen2.5` (5 GB); add generous timeouts; close other apps when testing LLM features |
| B4 | **No GPU** — CPU-only inference is slow | Non-blocking | Accept slow inference during development; design UI with loading states |
| B5 | **Gujarati/Hindi capability unverified** — Ollama test timed out | Medium | Must verify after switching to llama3.2 with more available memory |
| B6 | **npm.ps1 blocked** by execution policy | Low | Use `npm.cmd` / `npx.cmd` consistently |

---

## 9. Proposed Implementation Plan

### Phase 1: Project Scaffolding and Foundation

**Objective:** Create the project skeleton with build tooling, database schema, and basic API.

**Tasks:**
1. Initialise Git repository with `.gitignore`.
2. Create Python virtual environment; install dependencies (`fastapi`, `uvicorn`, `pydantic`, `httpx`, `pytest`, `python-dotenv`).
3. Scaffold Vite + React frontend using `npx.cmd create-vite`.
4. Design and create SQLite database schema:
   - `products` table (id, name, sku, category, stock_qty, base_unit, purchase_price, selling_price, low_stock_threshold, active, created_at, updated_at)
   - `unit_conversions` table (id, product_id, from_unit, to_unit, factor)
   - `transactions` table (id, type, status, idempotency_key, original_instruction, created_at, confirmed_at)
   - `transaction_items` table (id, transaction_id, product_id, quantity, unit, unit_price, line_total)
   - `inventory_movements` table (id, product_id, transaction_id, movement_type, quantity_change, stock_before, stock_after, created_at) — append-only
5. Create `.env.example` with Ollama endpoint configuration.
6. Create `docs/DATABASE_SCHEMA.md`.
7. Create backup/restore scripts.
8. Initial commit.

**Acceptance criteria:**
- `git log` shows at least one commit.
- Backend starts with `uvicorn`.
- Frontend starts with `npm run dev`.
- Database file is created with correct schema.
- Backup script produces a timestamped copy.

---

### Phase 2: Product Management (CRUD)

**Objective:** Full product lifecycle with API and UI.

**Tasks:**
1. FastAPI endpoints: `POST /api/products`, `GET /api/products`, `GET /api/products/{id}`, `PUT /api/products/{id}`, `PATCH /api/products/{id}/deactivate`.
2. Input validation (Pydantic models).
3. Product search by name/SKU.
4. Unit conversion management (`POST /api/products/{id}/conversions`).
5. React product list, create form, edit form, search.
6. Tests: product CRUD, validation, duplicate SKU, deactivation, unit conversions.

**Acceptance criteria:**
- All product CRUD operations work end-to-end.
- Unit conversions are stored and retrievable.
- Tests pass.

---

### Phase 3: Sales and Purchase Transactions

**Objective:** Record, confirm, and track transactions with inventory impact.

**Tasks:**
1. Transaction creation endpoint (draft status).
2. Transaction confirmation endpoint (applies stock changes in a DB transaction).
3. Idempotency key to prevent duplicate posting.
4. Append-only inventory movement log.
5. Stock validation (prevent negative stock on sales).
6. Reversal endpoint (creates a corrective transaction, does not delete history).
7. React transaction form and confirmation review screen.
8. Tests: stock decrease on sale, stock increase on purchase, insufficient stock, duplicate submission, rollback on failure, reversal.

**Acceptance criteria:**
- Sales deduct stock; purchases add stock.
- Duplicate submissions are rejected.
- Failed transactions roll back cleanly.
- Movement history is append-only and auditable.

---

### Phase 4: Multilingual Text Interpretation (Ollama Integration)

**Objective:** Accept natural-language instructions and produce structured transaction proposals.

**Tasks:**
1. Define JSON schema for LLM output (transaction type, items with product name, quantity, unit).
2. Create prompt template with strict instructions (no invention, no SQL, schema-conformant output).
3. FastAPI endpoint `POST /api/interpret` — sends user text to Ollama, validates response against schema.
4. Product matching against real catalog (fuzzy matching for names).
5. Ambiguity detection and clarification requests.
6. Input sanitisation (prevent prompt injection).
7. React text input with submit, loading state, and timeout handling.
8. Tests: English parsing, Hindi parsing, Gujarati parsing (if model supports), invalid output handling, unknown products, ambiguous names.

**Acceptance criteria:**
- English instructions produce valid structured proposals.
- Hindi/Gujarati tested (results documented as pass/fail/limited).
- Invalid LLM output is rejected gracefully.
- No invented products, prices, or quantities in output.
- Loading states work during slow inference.

---

### Phase 5: Human Approval Flow

**Objective:** Review screen between AI proposal and transaction posting.

**Tasks:**
1. Display original instruction, parsed details, matched products, stock impact, prices, totals.
2. Show warnings (low stock, ambiguous matches, unresolved items).
3. Allow editing the proposal before confirmation.
4. Re-validate on backend at confirmation time.
5. Tests: approval flow end-to-end, rejection, editing, re-validation.

**Acceptance criteria:**
- No transaction posts without explicit human confirmation.
- Backend re-validates at confirmation (not just frontend check).
- Warnings displayed for edge cases.

---

### Phase 6: Reports

**Objective:** Business reporting dashboard.

**Tasks:**
1. API endpoints: daily sales totals, purchase totals, transaction counts, product-wise quantities, current stock, low-stock alerts.
2. Clear labelling: revenue ≠ profit. Profit = revenue - cost of goods sold.
3. React reports dashboard with date filters.
4. Tests: report totals match recorded transactions.

**Acceptance criteria:**
- Reports are mathematically consistent with transaction data.
- Revenue and profit are correctly distinguished.
- Low-stock products are flagged.

---

### Phase 7: Polish, Backup, and Documentation

**Objective:** Production readiness (local deployment).

**Tasks:**
1. Finalise backup and restore documentation.
2. Error handling and edge cases.
3. UI polish and responsive design.
4. Comprehensive test suite run with results documented.
5. `README.md` with setup, run, test, and backup instructions.
6. Final security review.

**Acceptance criteria:**
- All tests documented (passed/failed/skipped/not run).
- Backup and restore tested.
- Application starts and runs without external network.
- Documentation is complete.

---

## 10. Architecture Diagram

```
+-----------------------------------------------------------+
|                    User (Shopkeeper)                       |
|              Types in Gujarati / Hindi / English           |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|              React Frontend (Vite)                         |
|  +----------+ +----------+ +----------+ +--------------+  |
|  | Products | | Text     | | Review & | | Reports      |  |
|  | Manager  | | Input    | | Confirm  | | Dashboard    |  |
|  +----------+ +----------+ +----------+ +--------------+  |
+-----------------------------+-----------------------------+
                              | HTTP (localhost)
                              v
+-----------------------------------------------------------+
|              FastAPI Backend (Python)                       |
|  +----------+ +----------+ +----------+ +--------------+  |
|  | Product  | | Transact | | LLM      | | Report       |  |
|  | API      | | API      | | Service  | | API          |  |
|  +----------+ +----------+ +----------+ +--------------+  |
|                              |                             |
|                              v                             |
|                    +------------------+                    |
|                    | Ollama Client    |                    |
|                    | (httpx -> :11434)|                    |
|                    +------------------+                    |
|                              |                             |
|              +---------------+--------------+              |
|              v                              v              |
|    +------------------+          +------------------+      |
|    | SQLite Database  |          | Ollama Server    |      |
|    | (local file)     |          | (localhost:11434)|      |
|    +------------------+          +------------------+      |
+-----------------------------------------------------------+
```

---

## 11. File Structure (Proposed)

```
DukaanVoice AI/
├── docs/
│   ├── DUKAANVOICE_BASELINE_AUDIT.md    # This file
│   ├── DATABASE_SCHEMA.md               # Phase 1
│   └── BACKUP_RESTORE.md               # Phase 1
├── backend/
│   ├── main.py                          # FastAPI app entry
│   ├── database.py                      # SQLite connection & schema
│   ├── models.py                        # Pydantic models
│   ├── routers/
│   │   ├── products.py
│   │   ├── transactions.py
│   │   ├── interpret.py
│   │   └── reports.py
│   ├── services/
│   │   ├── ollama_client.py
│   │   ├── product_matcher.py
│   │   └── inventory.py
│   ├── tests/
│   │   ├── test_products.py
│   │   ├── test_transactions.py
│   │   ├── test_interpret.py
│   │   └── test_reports.py
│   ├── backups/                         # SQLite backup storage
│   ├── requirements.txt
│   └── .env.example
├── frontend/                            # Vite + React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── .env.example
└── README.md
```

---

## 12. Summary of Findings

| Area | Status |
|------|--------|
| Repository | Empty — greenfield project, no conflicts |
| Python environment | ✅ 3.12.10 with FastAPI, Uvicorn, Pydantic, pytest globally installed |
| Node.js environment | ✅ v24.21.0 with npm 11.19.0 (use `.cmd` variants) |
| Git | ✅ Installed, needs `git init` |
| Ollama | ✅ Running with 2 models installed |
| Recommended LLM | `llama3.2:latest` (3.2B) — lighter for 8 GB RAM / CPU-only system |
| GPU | ❌ Not available — CPU-only inference |
| RAM | ⚠️ 8 GB total, critically low free memory |
| Disk | ✅ ~122 GB free |
| Database | None exists — will create SQLite |
| Existing data to preserve | None |
| Security risks | None currently (empty project) |
| Biggest risk | LLM inference speed on CPU-only / low-RAM system |

---

**Status: Phase 0 complete. Awaiting approval to proceed to Phase 1.**
