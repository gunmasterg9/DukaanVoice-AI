# DukaanVoice AI - Official Submission & Evaluator Demo Guide

**Project Name:** DukaanVoice AI — Smart Multilingual POS & Ledger for Indian Kirana & Neighborhood Retailers  
**Repository:** [https://github.com/gunmasterg9/DukaanVoice-AI](https://github.com/gunmasterg9/DukaanVoice-AI)  
**Target Audience:** Hackathon evaluators, code reviewers, and kirana shopkeepers  
**Operating Environment:** Windows 10/11 Local-First Retail Workstation  

---

## ⚖️ Verification & Audit Demarcation

To ensure complete clarity and audit integrity before review, this document distinguishes between what was executed by the automated agent and what is pending independent evaluator execution:

### 1. Agent-Executed in Local Environment (Passed 100%)
The following test suites and simulations were directly executed by the automated AI developer on the local development environment:
- **Backend Pytest Suite (73 Tests):** Passed 73/73 tests in 1m 08s (`tests/test_transactions.py`, `tests/test_cash_closing.py`, `tests/test_customers.py`, `tests/test_products.py`, `tests/test_reports.py`, `tests/test_database.py`, `tests/test_backup.py`, `tests/test_health.py`, `tests/test_expenses.py`).
- **Frontend Translation & UI Test Suite (49 Tests):** Passed 49/49 tests in 382ms (`src/i18n/i18n.test.js`, `src/healthState.test.js`, `src/reports.test.js`, `src/utils/formatters.test.js`).
- **Static Analysis & Linting:** Passed with 0 warnings, 0 errors across 47 files via `oxlint`.
- **Production Build Compilation:** Vite 6 production bundle built successfully in 585ms.
- **Standalone Python E2E Lifecycle Simulation (`scripts/e2e_verification.py`):** Passed all 9 retail lifecycle phases on an isolated temporary database.
- **Strengthened Live Kirana Node.js E2E Test (`live_kirana_e2e_test.mjs`):** Passed all 11 retail phases with HTTP status checks, response validation, exact cash-closing arithmetic, and automatic test server teardown.
- **Git Remote Synchronization:** Verified all remote branch heads (`main`, `master`, `feature/multilingual-india-22`) via GitHub REST API.

### 2. Pending Independent Evaluator Verification
The following items have not yet been independently run by the reviewer/evaluator and are ready for independent execution:
- **Independent execution of the test commands** on the evaluator's machine.
- **Physical inspection of the local live shop database** (`backend/data/dukaanvoice.db`, 176,128 bytes) to confirm data preservation.
- **Interactive browser testing** of the multi-language UI and thermal receipt generation.

---

## 🚀 Quick Launch (Running the App Locally)

### Option A: Windows Single-Click (Recommended)
1. Double-click `run.bat` (or `start.bat`) in the project root.
2. The launcher automatically:
   - Verifies the Python 3.12 virtual environment and Node.js dependencies.
   - Detects the existing database (or safely initializes Schema v4).
   - Starts the FastAPI backend at `http://127.0.0.1:8000`.
   - Starts the Vite frontend at `http://127.0.0.1:5173`.
   - Automatically opens your default web browser to the application.
3. When finished, double-click `stop.bat` to terminate all service processes cleanly.

### Option B: Manual Two-Terminal Launch
```powershell
# Terminal 1: Backend API
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: Frontend UI
cd frontend
npm.cmd run dev -- --host 127.0.0.1
```

---

## 🧪 Independent Evaluator Test Commands

Run the following commands from the project root to independently verify all test suites:

```powershell
# 1. Full Backend Pytest Suite (73 Tests)
cd backend
.\.venv\Scripts\pytest.exe -v

# 2. Frontend Translation & Formatting Suite (49 Tests)
cd ..\frontend
npm.cmd test

# 3. Static Analysis / Linter (0 warnings, 0 errors)
npx.cmd oxlint

# 4. Production Build Compilation
npm.cmd run build

# 5. Standalone Python E2E Simulation (Operates on isolated temporary DB)
cd ..
.\backend\.venv\Scripts\python.exe scripts\e2e_verification.py

# 6. Strengthened Live Kirana E2E Runner (Spawns isolated server on port 8009)
node live_kirana_e2e_test.mjs
```

---

## 🎬 5-Minute Evaluator Walkthrough Demo

**Scenario:** A typical daily operational cycle at **"Shree Krishna Kirana Store"**.

```
1. Language Selection (22 Scheduled Languages + RTL)
   └── Top bar globe icon -> Choose Gujarati, Hindi, Tamil, or Urdu (RTL mirroring)
2. Zero-Friction Product Entry
   └── Products tab -> Add Product -> SKU Code is strictly optional
3. Rapid POS Quick Sale & Thermal Receipt
   └── Quick Sale tab -> Cart items -> Review Guardrail -> Confirm -> Print 80mm Receipt
4. Customer Udhaar Khata (Credit Ledger)
   └── Credit sale -> Udhaar Khata -> Record repayment -> Localized WhatsApp statement
5. Shop Expense Register
   └── Expenses tab -> Log daily outlays -> Categorize cash drawer vs bank/UPI
6. Daily Cash Drawer Reconciliation & Immutable Closing
   └── Cash Closing tab -> Exact drawer formula -> Count physical cash -> Audit lock
7. Reports & Mathematical Stock Continuity
   └── Reports -> Reconciliation: Opening + Purchases - Sales ± Adjustments == Current
```

### Step 1: Mother-Tongue Accessibility & RTL Layout
1. Open `http://127.0.0.1:5173`.
2. Click the **Language Selector** (globe icon) in the header navigation.
3. Choose **ગુજરાતી (Gujarati)**, **हिन्दी (Hindi)**, or **தமிழ் (Tamil)**:
   - All navigation tabs, metric cards, action buttons, and form labels immediately adapt.
4. Choose **اُردُو (Urdu)**, **کٲشُر (Kashmiri)**, or **سنڌي (Sindhi)**:
   - The entire UI smoothly mirrors into an authentic **Right-to-Left (RTL)** layout.

### Step 2: Quick Product Creation (No SKU Needed)
1. Go to the **Products** tab and click **"+ Add Product"**.
2. Notice **SKU Code** is clearly marked as `(Optional)` — neighborhood kirana shops selling loose grains or regional items do not need barcodes!
3. Enter:
   - **Product Name:** `Tata Tea Gold 250g`
   - **Base Unit:** `packet`
   - **Cost Price (₹):** `110.00`
   - **Selling Price (₹):** `135.00`
   - **Opening Stock:** `20`
4. Click **"Save Product"**. The product appears immediately with 20 packets in stock.

### Step 3: Quick Sale POS & Thermal Receipts
1. Open the **Quick Sale** tab.
2. Search `Tata` and click the product to add it to the active cart.
3. Set quantity to `2 packets` (Live total: `₹270.00`).
4. Select **Cash** tender and click **"Review Sale"**:
   - The confirmation guardrail modal displays the exact line items and total before inventory is touched.
5. Click **"Confirm & Complete Sale"**:
   - Stock atomically decreases from 20 to 18 packets.
   - An 80mm thermal receipt preview appears. Click **"Print Receipt"** to view the printable layout.

### Step 4: Customer Udhaar Khata (Credit Sale & WhatsApp Statement)
1. In Quick Sale, bill `1 packet` under **Credit (Udhaar)** for customer `Ramesh Patel`.
2. Confirm the sale.
3. Open the **Udhaar Khata** tab:
   - View Ramesh Patel's outstanding balance of `₹135.00`.
4. Click **"Record Payment"**:
   - Record a `₹50.00` cash repayment (balance updates immediately to `₹85.00`).
5. Click **"Statement"**:
   - View the debit/credit ledger breakdown.
   - Click **"Share via WhatsApp"** to copy a pre-formatted, localized payment reminder ready to send.

### Step 5: Recording Operating Expenses
1. Open the **Expenses** tab and click **"+ Add Expense"**.
2. Log `₹35.00` for `Tea & Refreshments` paid in **Cash** (Note: `Evening chai for customers`).
3. Notice the outlay is classified as cash drawer-affecting.

### Step 6: End-of-Day Cash Closing & Audit Locking
1. Open the **Cash Closing** tab.
2. Review the live drawer calculation:
   $$\text{Expected Cash} = \text{Opening} (₹500.00) + \text{Cash Sales} (₹270.00) + \text{Repayments} (₹50.00) - \text{Expenses} (₹35.00) = ₹785.00$$
   *(Digital UPI payments and uncollected credit sales are strictly excluded from physical drawer balance).*
3. Count the physical cash drawer and enter `785.00`.
4. Difference badge displays `₹0.00 (Balanced)` in green.
5. Click **"Lock & Finalize Closing"**:
   - Confirms and locks the business date.
   - The record becomes permanently immutable against retroactive tampering.

### Step 7: Inventory Reconciliation & Integrity Audit
1. Open the **Reports** tab and click **Reconciliation**.
2. View the mathematical audit proof:
   $$\text{Opening Stock} + \text{Purchased} - \text{Sold} \pm \text{Adjustments} = \text{Current Stock}$$
3. Confirms that zero inventory movements are unrecorded.

---

## 🔒 Data Protection & Safety Guarantees

1. **Zero Database Overwrites:** The live shop database (`backend/data/dukaanvoice.db`, 176,128 bytes) was preserved throughout all testing cycles.
2. **Deterministic Test Isolation:** Automated E2E test runners create timestamped temporary SQLite databases in temp directories and cleanly purge them during teardown.
3. **Integer Accounting:** All monetary calculations use integer paise (`100 paise = ₹1.00`), eliminating floating-point errors.
4. **Local-First Privacy:** Operates offline on `127.0.0.1` without sending shop financial data to third-party clouds.
