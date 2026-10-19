# Amazon Developer Hackathon 2026: Alexa+ Track
## DukaanVoice for Alexa+ Video Demo Script (< 3 Minutes)

**Target Audience:** Hackathon Reviewers, Technical Judges, Amazon Alexa+ Evaluators  
**Total Target Duration:** 2 minutes 50 seconds (Under 3-minute hard ceiling)  
**Language:** English (with authentic multilingual Hindi & Gujarati shopkeeper utterances)  
**Live Application URL:** `http://127.0.0.1:5173` (Frontend) & `http://127.0.0.1:8000` (Backend API & MCP Server)

---

### Scene Breakdown & Teleprompter

#### [0:00 - 0:20] 1. Small-Shop Problem & Kirana Context
- **Visual Action:**
  - Screen opens on DukaanVoice AI running in browser at `http://127.0.0.1:5173`.
  - Show the clean store register interface with product catalog.
- **Narrator Spoken Script (English):**
  > *"Across India, over twelve million neighborhood Kirana shopkeepers manage daily retail with their hands full—measuring grains, packing staples, and serving customers. Tapping POS screens during busy morning and evening rushes causes friction, delays, and lost sales. Kirana merchants need a voice-first assistant that speaks their language and manages store inventory with absolute mathematical precision."*

---

#### [0:20 - 0:45] 2. Introduction to Simulated Alexa+ Experience
- **Visual Action:**
  - Click on the **"🎙️ Alexa+ Retail"** navigation tab.
  - Highlight the header: `DukaanVoice: Alexa+ Simulated Experience`.
  - Point to the live status badge: `● MCP Online` and the active session header `Session: ...`.
  - Point out the clear prototype simulation banner (no unauthorized Amazon logos or live hardware prerequisite).
- **Narrator Spoken Script (English):**
  > *"To solve this, we built DukaanVoice for Alexa+—a simulated conversational shop register integrated directly into our store application using the open Model Context Protocol (MCP 2025-11-25). Over Streamable HTTP, Alexa+ connects to our local FastAPI server, discovering four deterministic retail tools without custom middleboxes or cloud dependencies."*

---

#### [0:45 - 1:10] 3. Workflow A: Real Inventory Lookup
- **Visual Action:**
  - In the Alexa+ simulator, click the preset scenario button: `🍪 Biscuits left? (EN)` or speak `"How many packets of biscuits are left?"`.
  - Show the visible loading spinner: `Executing authoritative retail tool via Model Context Protocol...`.
  - Assistant responds with real database stock from `get_inventory`:
    - Shows product name, current stock in base units, unit price, and low-stock indicators.
- **Narrator Spoken Script (English):**
  > *"Let's test an inventory lookup. The shopkeeper asks: 'How many packets of biscuits are left?'.  
  > Alexa+ calls `get_inventory` through MCP. It queries the live SQLite database and reports the exact stock in base units and selling price. It never hallucinates or fabricates a balance."*

---

#### [1:10 - 1:45] 4. Workflow B: Sale Proposal, Confirmation & Verification
- **Visual Action:**
  - Click the scenario button: `🍪 Sell 5 biscuits (EN)` or speak `"Sell five packets of biscuits"`.
  - An **Action Proposal Card** appears in amber:
    - *Product:* Parle-G Gold
    - *Quantity:* 5 piece
    - *Total Amount:* ₹50.00
    - *Stock Impact:* `45 -> 40 piece`
    - *Draft ID:* `#3`
  - Explain that database stock is still 45.
  - Click the green button **"✓ Confirm & Update Stock"**.
  - Assistant displays: `✅ Sale confirmed! Updated stock is now 40 piece.`
- **Narrator Spoken Script (English):**
  > *"Now let's record a sale. The shopkeeper says: 'Sell five packets of biscuits'.  
  > For safety, DukaanVoice enforces a two-step proposal guardrail. Calling `record_sale` with `confirm=false` generates a verified proposal with a stock delta preview, leaving database stock completely untouched.  
  > When the merchant reviews and clicks 'Confirm', the tool executes with `confirm=true` and the draft ID, atomically deducting inventory in the database ledger."*

---

#### [1:45 - 2:05] 5. Cancellation Safety (Zero Stock Mutation)
- **Visual Action:**
  - Click the preset scenario button: `📦 Sell 2 packets (HI)` (`"पांच पैकेट बिस्कुट बेचने हैं"`).
  - A new Action Proposal Card appears.
  - Instead of confirming, click the outline button **"✕ Cancel"** (or type `"Cancel"`).
  - The proposal clears and assistant reports: `🛑 Proposed action was cancelled. No changes were made to store stock.`
- **Narrator Spoken Script (English):**
  > *"What if the customer changes their mind? The merchant clicks 'Cancel' or says 'Cancel'.  
  > The active proposal is instantly discarded without dispatching a mutation. Our automated tests verify that inventory remains strictly unchanged in SQLite."*

---

#### [2:05 - 2:25] 6. Workflow D: Daily Sales Report
- **Visual Action:**
  - Click the preset scenario button: `📊 Today's sales (EN)` or speak `"Show today's sales"` (or in Hindi `"आज की बिक्री बताओ"`).
  - Assistant calls `get_daily_report` and displays real net sales revenue and confirmed transaction counts for the current business date.
- **Narrator Spoken Script (English):**
  > *"At closing time, the shopkeeper asks: 'Show today's sales'—or in Hindi, 'आज की बिक्री बताओ'.  
  > Alexa+ calls `get_daily_report`, returning verified net revenue and transaction counts computed directly by the backend."*

---

#### [2:25 - 2:45] 7. Open Architecture & MCP Tool Verification
- **Visual Action:**
  - Switch briefly to terminal or browser DevTools Network tab showing `POST /api/mcp`.
  - Show the JSON-RPC 2.0 handshake, session tracking headers, and the 4 registered tools: `get_inventory`, `record_sale`, `record_purchase`, and `get_daily_report`.
  - Briefly click on the **"⚡ Quick Sale"** tab to show that existing POS, Udhaar Khata, and Cash Closing screens remain 100% operational.
- **Narrator Spoken Script (English):**
  > *"Behind the scenes, DukaanVoice implements standard Streamable HTTP over `/api/mcp` using the official Python MCP SDK. All 15 backend protocol tests and 72 frontend unit tests pass with zero lint errors. Existing POS billing, Udhaar Khata, and cash drawer features remain completely intact."*

---

#### [2:45 - 2:55] 8. Summary & Retailer Impact
- **Visual Action:**
  - Return to the clean Alexa+ Retail screen with success badge and summary.
  - Display project credits and hackathon track details.
- **Narrator Spoken Script (English):**
  > *"DukaanVoice for Alexa+ bridges the gap between natural voice and transactional enterprise integrity—delivering hands-free speed for neighborhood retailers across India. Thank you!"*

---

### Recording & Audio Guidelines
1. **Video Resolution:** 1080p (1920x1080) at 60fps (OBS Studio recommended).
2. **Audio:** High-quality microphone in quiet environment; narrate in clear, steady English.
3. **Pacing:** Keep cursor movements smooth; allow 1 second after each action card renders before speaking.
4. **Length:** Strictly keep total duration between 2:40 and 2:55 (under 3:00 minute limit).
