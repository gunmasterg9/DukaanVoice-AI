# Known Limitations & Operating Boundaries

**DukaanVoice AI** is intentionally designed as an offline-capable, local-first retail register for small Indian shops. To maintain complete transparency, the following technical boundaries and known limitations should be noted:

---

## 1. Speech Recognition & Voice Capabilities

- **Browser Engine Dependency:** DukaanVoice AI currently utilizes the standard W3C Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) to avoid requiring gigabytes of neural weights or dedicated GPU hardware on low-cost POS machines.
- **Offline Voice Availability:**
  - In Google Chrome, voice recognition typically routes audio to Google's cloud speech service, which requires an active internet connection.
  - In Microsoft Edge on Windows 11, local speech packs may provide offline recognition if installed in the Windows Speech settings.
  - In browsers that do not support Web Speech API (or when the microphone is unavailable), the voice mic button gracefully disables and prompts the user to use the natural language typed Command Bar.
- **Microphone Hardware & Ambient Noise:** In noisy Indian market environments, standard built-in laptop microphones may struggle with background chatter. A directional USB mic or headset is recommended for speech input.
- **Speech Parsing Guardrails:** Natural language voice commands *never* commit financial or inventory changes directly. They only populate draft transactions for explicit review and confirmation by the shopkeeper.

---

## 2. UPI & Digital Payments

- **Cashier-Recorded Verification Only:** Digital UPI payments recorded in DukaanVoice AI (e.g., via QR code display or UPI soundbox) are recorded as tender by the cashier.
- **No Direct Bank Webhook:** The application does *not* connect directly to NPCI or individual bank APIs to automatically verify bank settlement status. The shopkeeper must visually confirm receipt of payment (e.g., via soundbox announcement or UPI app notification) before confirming the sale.

---

## 3. Concurrency & Multi-Terminal Setup

- **Single-Workstation Architecture:** DukaanVoice AI is optimized as a single-workstation register running on the shop counter's PC or laptop.
- **SQLite Concurrency:** SQLite in WAL (Write-Ahead Logging) mode allows simultaneous readers and smooth local performance. However, deploying the application across multiple simultaneous billing counters sharing the same database file over a network share (SMB/NFS) is not supported and can cause database locking.

---

## 4. Multilingual Dialects & Vernacular Nuances

- **Standard Literary Forms:** Translations for all 22 Eighth Schedule Indian languages use standard, grammatically correct terms and recognized retail vocabulary.
- **Dialectal Variation:** Colloquial bazaar terminology (such as regional slang for units or discounts) may differ across districts. The system provides clear visual icons and fallback to English to ensure clarity.

---

## 5. Cloud Synchronization & Multi-Branch Management

- **Local-First Storage:** All store data, inventory movements, customer ledgers, and cash records are stored locally in `backend/data/dukaanvoice.db`.
- **Manual Backups:** While built-in hot backups can be triggered with one click (`docs/BACKUP_RESTORE.md`), automated multi-branch cloud replication is not included in v1.0.0.

---

## 6. Hardware & Printing

- **Printer Drivers:** The thermal receipt and customer statement print layouts are designed for standard Windows print dialogs (`window.print()`). Compatible with 80mm and 58mm thermal receipt printers as well as standard A4/letter office printers.
- **Barcode Scanners:** Standard USB/Bluetooth HID keyboard-emulation barcode scanners are supported natively in the product search box.
