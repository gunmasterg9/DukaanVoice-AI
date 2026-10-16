# DukaanVoice AI
**Multilingual Smart Shop Register (22 Scheduled Indian Languages + English)**

DukaanVoice AI is a local-first shop management application designed to simplify inventory, sales, purchases, and ledger reconciliation for small retailers across India.

**Project goal:** Make reliable digital shop management accessible to retailers in their own mother tongue across all 22 constitutionally scheduled Indian languages, with a Gujarati-first baseline and extensible architecture.

---

### Key Features
- **Multilingual Interface:** Full support for all 22 Eighth Schedule Indian languages plus English with native script rendering.
- **RTL Script Support:** Bidirectional layout engine for Perso-Arabic scripts (Urdu, Kashmiri, Sindhi).
- **Product Management:** Product registration, SKU uniqueness, search, category filtering, and stock management.
- **Sales & Purchase Workflows:** Draft creation with live line estimation and explicit atomic confirmation.
- **Auditable Stock Ledger:** Automatic inventory updates and auditable stock movements (`inventory_movements`).
- **Data Safety:** Transaction reversal safeguards, idempotency protection, and unit conversion support.
- **Business Reports:** Daily sales and purchase expenditure breakdown.
- **Product Analytics:** Product-wise sales analysis in base units and inventory valuation (cost & selling value).
- **Inventory Reconciliation:** Mathematical stock ledger reconciliation to identify stock discrepancies and audit gaps.
- **Natural Command Bar:** Typed natural-language queries in Indian languages with strict draft-only guardrails.
- **Modular Voice Readiness:** Prepared architecture separating ASR, language identification, intent parsing, and TTS.
- **Full-Stack Architecture:** React + Vite frontend with FastAPI backend and SQLite database.

---

### Implementation Status
- **Phase 1 (Foundation):** Safe SQLite schema v1, FastAPI health/readiness checks, backup/restore CLI.
- **Phase 2 (Product Catalog):** Complete product CRUD, unit conversions, and low-stock indicators.
- **Phase 3 (Transactions):** Sales and purchase drafts, atomic confirmation, and compensating reversals.
- **Phase 4 (Reports & Reconciliation):** Daily sales analytics, purchase ledger, inventory valuation, and mathematical ledger continuity reconciliation.
- **Phase 5 (Multilingual India Expansion):** 22 Indian scheduled languages + English dictionaries, LanguageSelector with native names, RTL layout engine, command parser with confirmation guardrails, and automated test suite.

---

## Supported Indian Languages (8th Schedule)

DukaanVoice AI includes centralized translation dictionaries for all 22 scheduled Indian languages plus English:

| # | Code | Language | Native Name | Script | Direction | Primary Region |
|---|---|---|---|---|---|---|
| 1 | `gu` | Gujarati (Default) | ગુજરાતી | Gujarati | LTR | Gujarat |
| 2 | `hi` | Hindi | हिन्दी | Devanagari | LTR | North & Central India |
| 3 | `en` | English (Fallback) | English | Latin | LTR | Pan-India / International |
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

## How to Change the Language

1. Click the **Language Selector** button in the top right header (globe icon displaying the active native language).
2. Type in the search box to filter languages by English name or native script.
3. Click any language to apply it instantly across the application.
4. Your choice is automatically persisted in `localStorage['dukaanvoice_locale']` across sessions.
5. If any localized key is missing, the system gracefully falls back to English without crashing.

### RTL (Right-to-Left) Script Support
When switching to **Urdu** (`ur`), **Kashmiri** (`ks`), or **Sindhi** (`sd`):
- `document.documentElement.dir` is dynamically set to `rtl`.
- Navigation, headers, toolbars, tables, and modal actions automatically mirror horizontally.
- Font stack prioritizes native Windows `Nirmala UI`, `Segoe UI`, and `Noto Sans` for crisp rendering.

---

## Language-Aware Command Bar & Safety Guardrails

The interactive Command Bar allows shopkeepers to type natural queries in Indian languages:

- **Stock queries:** e.g., `stock chai`, `સ્ટોક ચા` (Gujarati), `चावल का स्टॉक` (Hindi), `இருப்பு டீ` (Tamil).
- **Daily sales summaries:** e.g., `today sales`, `આજનું વેચાણ`, `आज की बिक्री`, `இன்றைய விற்பனை`.
- **Transaction drafting:** e.g., `sell 2 kg rice`, `વેચાણ 5 કિલો ચોખા`.

### Strict Safety Guardrails (Phase 3 & 4 Protection)
> [!IMPORTANT]
> **Deterministic Guardrail:** Natural language text input **NEVER** directly confirms a transaction, alters stock balances, or executes database updates.
> - Transaction requests create a **Draft only** with `status: 'draft'` via `api.createTransactionDraft(...)`.
> - The shopkeeper must explicitly review products, quantities, units, and estimated totals, and click **"Confirm & Update Inventory"** to commit changes atomically.
> - The backend remains the sole authoritative source of truth for stock quantities (integer milli-units) and monetary balances (integer paise).

---

## Modular Voice Readiness Architecture

The voice architecture is structured into four decoupled layers for future offline/online expansion:

```
[1. Speech-to-Text (ASR)]  ──►  [2. Language Identification (LID)]
           │                                   │
           ▼                                   ▼
[3. Intent Parser (Deterministic)] ◄───  [Normalized Query]
           │
           ▼
[Draft Creation / Read Query]
           │
           ▼
[4. Text-to-Speech (TTS)]  ──►  Audible Shopkeeper Feedback
```

### Local / Offline Model Benchmark Analysis
Before deploying heavy neural models on low-resource retail POS machines, open-source options were analyzed:

| Option | Architecture | Model Size | RAM/VRAM | Languages Covered | Latency (CPU) | Offline Capability |
|---|---|---|---|---|---|---|
| **WebSpeech API (Current)** | Browser Native | 0 MB | 0 MB | Varies by OS/Browser | < 300ms | Depends on browser engine |
| **Whisper.cpp (Tiny/Base)** | Quantized Transformer | 75–145 MB | ~500 MB RAM | English, Hindi + major Indic | 1.2–2.5s | 100% Offline |
| **AI4Bharat IndicASR** | Conformer-CTC | 350 MB | ~1.5 GB RAM | 22 Scheduled Languages | 1.5–3.0s | 100% Offline (PyTorch) |
| **Sherpa-ONNX / Vosk** | Kaldi / RNN-T | 40–100 MB | ~300 MB RAM | Select Indic languages | < 800ms | 100% Offline |

*Decision:* WebSpeech API is used as the non-blocking zero-download baseline with clean fallback to typed commands. Large weights (>500MB) are intentionally excluded from the core repository to keep the application lightweight, local-first, and immediately deployable.

---

## Language Coverage Matrix

| Locale | Code | Interface Translated | UI Automated Tested | Text Commands Tested | Speech Recognition (ASR) | Speech Synthesis (TTS) |
|---|---|---|---|---|---|---|
| Gujarati | `gu` | Verified (100%) | Verified | Verified | WebSpeech ready | WebSpeech ready |
| Hindi | `hi` | Verified (100%) | Verified | Verified | WebSpeech ready | WebSpeech ready |
| English | `en` | Verified (100%) | Verified | Verified | WebSpeech ready | WebSpeech ready |
| Assamese | `as` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Bengali | `bn` | Verified (100%) | Verified | Verified | WebSpeech ready | WebSpeech ready |
| Bodo | `brx` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Dogri | `doi` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Kannada | `kn` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Kashmiri | `ks` | Verified (100% RTL) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Konkani | `kok` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Maithili | `mai` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Malayalam | `ml` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Manipuri | `mni` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Marathi | `mr` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Nepali | `ne` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Odia | `or` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Punjabi | `pa` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Sanskrit | `sa` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Santali | `sat` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Sindhi | `sd` | Verified (100% RTL) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Tamil | `ta` | Verified (100%) | Verified | Verified | WebSpeech ready | WebSpeech ready |
| Telugu | `te` | Verified (100%) | Verified | Extensible | WebSpeech ready | WebSpeech ready |
| Urdu | `ur` | Verified (100% RTL) | Verified | Extensible | WebSpeech ready | WebSpeech ready |

---

## Future Language Expansion Process

Adding support for an additional language (e.g., Bhojpuri, Marwari, Tulu) takes 3 simple steps:

1. **Register metadata** in `frontend/src/i18n/locales.js`:
   ```javascript
   { code: 'bho', name: 'भोजपुरी', englishName: 'Bhojpuri', nativeName: 'भोजपुरी', dir: 'ltr', script: 'Devanagari', region: 'Bihar / UP' }
   ```
2. **Create dictionary** `frontend/src/i18n/translations/bho.js` conforming to the section structure (`app`, `nav`, `common`, `dashboard`, `products`, `transactions`, `reports`).
3. **Export in index** `frontend/src/i18n/translations/index.js`.
4. Run `npm test` — the automated test suite will automatically discover and validate the new locale for key completeness and fallback safety!

---

## Layout

- `backend/` — FastAPI application (`app/`), tests, virtual environment
- `frontend/` — React + Vite UI, i18n dictionaries, command parser
- `docs/` — schema and backup documentation
- Shop data default path: `backend/data/dukaanvoice.db`

## Prerequisites (Windows PowerShell)

- Python 3.12
- Node.js 24 and `npm.cmd` (use the `.cmd` shims if PowerShell blocks `.ps1` scripts)
- Do not change the PowerShell execution policy for this project

## Backend Setup

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.cli init-db
```

## Frontend Setup

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd install
Copy-Item .env.example .env
```

## Quick Start (Windows Batch Files)

- **Start application:** Double-click `run.bat` (or `start.bat`).
  - Launches Backend API on `http://127.0.0.1:8000` (docs at `/docs`).
  - Launches Frontend UI on `http://127.0.0.1:5173`.
  - Automatically opens the web app in your default browser.
- **Stop application:** Double-click `stop.bat`.
  - Gracefully terminates processes and frees ports 8000 and 5173.

## Manual Run (Two PowerShell Terminals)

Terminal 1 — API:
```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — UI:
```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd run dev
```

## Tests and Verification

```powershell
# Backend automated test suite (55 tests)
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m pytest

# Frontend automated test suite (48 tests)
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\frontend"
npm.cmd test

# Frontend linter (0 errors, 0 warnings)
npx.cmd oxlint

# Production bundle build
npm.cmd run build
```

## Backup and Restore

See `docs/BACKUP_RESTORE.md`. Quick commands:

```powershell
cd "C:\Users\RAHUL\Desktop\gautam\DukaanVoice AI\backend"
.\.venv\Scripts\python.exe -m app.cli backup
.\.venv\Scripts\python.exe -m app.cli restore --backup "backups\dukaanvoice-YYYYMMDDTHHMMSSZ.db" --destination "data\dukaanvoice-restored.db"
```

## Safety Rules

- The API binds to `127.0.0.1` by default and is not shared on the LAN.
- CORS is limited to the configured development origins.
- Schema initialization never drops tables or deletes a database file.
- SQL used by the app is parameterized. There is no AI layer and no generated SQL.
- Changing languages never mutates stored products, prices, or inventory logs.
