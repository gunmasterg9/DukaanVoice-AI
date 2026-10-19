# DukaanVoice AI - Alexa+ Model Context Protocol (MCP) Integration

**Specification:** Model Context Protocol (MCP) `2025-11-25`  
**Transport:** Streamable HTTP (`/mcp`, `/api/mcp`)  
**Implementation:** Official Python MCP SDK (`mcp==2.3.0`, Starlette ASGI mount)  
**Security Model:** DNS Rebinding Protection configurable, Localhost/Workstation CORS, Strict 2-Step Action Proposal/Confirmation lifecycle.

---

## 1. Executive Summary & Architecture

The **DukaanVoice AI Alexa+ Integration** exposes Indian neighborhood retail capabilities (inventory lookup, sales proposals, supplier purchases, and daily financial reporting) directly to voice agents and LLMs via the **Model Context Protocol (MCP)**.

Rather than building an isolated, secondary inventory tracker, DukaanVoice AI mounts a native Streamable HTTP MCP server on top of its audited FastAPI backend. LLMs running via Alexa+, Amazon Bedrock, or custom clients interact directly with the shop's single source of truth (`dukaanvoice.db`) using atomic transactions, integer paise financial accuracy, and integer milli-unit stock tracking.

```
                           +----------------------------------------+
                           |  Amazon Alexa+ / LLM Orchestrator      |
                           +----------------------------------------+
                                              |
                                              | JSON-RPC 2.0 (Streamable HTTP)
                                              | Endpoint: /mcp or /api/mcp
                                              v
+-----------------------------------------------------------------------------------+
| FastAPI Application (backend/app/main.py)                                         |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Official Python MCP SDK Server (backend/app/mcp/server.py)                  |  |
|  | - Protocol Version: 2025-11-25                                              |  |
|  | - Streamable HTTP Session Manager                                           |  |
|  | - Header: Mcp-Session-Id tracking                                           |  |
|  +-----------------------------------------------------------------------------+  |
|                                       |                                           |
|       +-------------------------------+-------------------------------+           |
|       |                               |                               |           |
|       v                               v                               v           |
|  [get_inventory]               [record_sale]                  [record_purchase]   |
|  - Fuzzy Search (En/Hi/Gu)     - Step 1: Draft Proposal       - Step 1: Draft     |
|  - Stock & Unit lookup         - Step 2: Atomic Commit        - Step 2: Commit    |
|  - Category filter             - Overselling guardrail        - Supplier balance  |
|                                                                                   |
|  [get_daily_report]                                                               |
|  - Cash Drawer Reconciliation, UPI Total, Udhaar Ledger, Expense Summary          |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
                    +---------------------------------------+
                    | SQLite Database (backend/data/...)    |
                    | - Integer paise (100 = ₹1.00)         |
                    | - Integer milli-units (1000 = 1 unit) |
                    | - Immutable inventory_movements log   |
                    +---------------------------------------+
```

---

## 2. Protocol & Transport Specification

### 2.1 Transport: Streamable HTTP
- **Base Endpoint:** `http://127.0.0.1:8000/mcp` (or `http://127.0.0.1:8000/api/mcp`)
- **Protocol Standards:**
  - Content-Type: `application/json`
  - Protocol Version: `2025-11-25`
  - Session Tracking: Server issues and validates `Mcp-Session-Id` header across stateful connections.
  - DNS Rebinding Protection: Managed via `TransportSecuritySettings(enable_dns_rebinding_protection=False)` for local developer and workstation testing.

### 2.2 Protocol Handshake (`initialize`)

**Client Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "alexa-plus-client",
      "version": "1.0.0"
    }
  }
}
```

**Server Response (HTTP 200 OK + `Mcp-Session-Id` Header):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "dukaanvoice-alexa-mcp",
      "version": "1.0.0"
    }
  }
}
```

---

## 3. Retail Tool Catalog

The MCP server exposes four deterministic tools:

### 3.1 `get_inventory`
Queries current real-time stock levels, pricing, unit representations, and category classifications.

- **Parameters:**
  - `search_query` (*optional string*): Substring search matching product name, category, or barcode. Multilingual resolution supports Hindi and Gujarati item names (e.g., "મેગી", "मैगी", "आटा").
  - `category` (*optional string*): Filter products by catalog category.
  - `include_out_of_stock` (*optional boolean*, default `True`): Include items with 0 stock.

- **Example Invocation:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_inventory",
    "arguments": {
      "search_query": "Tata Salt"
    }
  }
}
```

- **Structured Output:**
```json
{
  "count": 1,
  "products": [
    {
      "id": 2,
      "name": "Tata Salt 1kg",
      "category": "Groceries",
      "barcode_sku": "8901030000002",
      "base_unit": "packet",
      "current_stock": 25.0,
      "selling_price_inr": 28.0,
      "cost_price_inr": 22.0
    }
  ]
}
```

---

### 3.2 `record_sale` (Two-Step Action Lifecycle)

Enforces safety by requiring explicit merchant confirmation before writing any database record or adjusting inventory.

- **Parameters:**
  - `items` (*required array of objects*): List of `{ product_id, quantity, unit_price_inr }`. Alternatively accepts `product_name` or `barcode_sku`.
  - `payment_method` (*required string*): `"cash"`, `"upi"`, or `"credit"`.
  - `customer_name` (*optional string*): Required if `payment_method == "credit"`.
  - `confirm` (*required boolean*):
    - `False`: Generates a non-committing **Action Proposal Card**. Validates item availability and calculates line items and totals. **No stock is deducted**.
    - `True`: Commits the transaction atomically within an SQLite transaction lock. Deducts inventory, logs immutable `inventory_movements`, and updates cash drawer/ledger.
  - `notes` (*optional string*): Additional remarks or contextual tags.

- **Step 1: Draft Proposal (`confirm: false`):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "record_sale",
    "arguments": {
      "items": [{ "product_name": "Maggi 2-Minute Noodles 70g", "quantity": 2 }],
      "payment_method": "cash",
      "confirm": false
    }
  }
}
```
*Returns proposal summary with total `₹28.00`, status `"PROPOSED_WAITING_CONFIRMATION"`, and inventory remaining preview without modifying database.*

- **Step 2: Atomic Execution (`confirm: true`):**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "record_sale",
    "arguments": {
      "items": [{ "product_name": "Maggi 2-Minute Noodles 70g", "quantity": 2 }],
      "payment_method": "cash",
      "confirm": true
    }
  }
}
```
*Returns transaction ID (e.g. `TXN-...`), status `"COMMITTED"`, and updated current stock.*

---

### 3.3 `record_purchase` (Supplier Restock)

Records inbound supplier inventory restocks with unit cost calculation and supplier ledger tracking.

- **Parameters:**
  - `items` (*required array of objects*): List of `{ product_id, quantity, unit_cost_inr }`. Accepts `product_name` or `barcode_sku`.
  - `supplier_name` (*optional string*): Name of the wholesaler/distributor.
  - `payment_method` (*required string*): `"cash"`, `"upi"`, or `"credit"`.
  - `confirm` (*required boolean*): `False` for draft preview; `True` for atomic inventory increment.

---

### 3.4 `get_daily_report` (Financial & Operational Summary)

Provides voice agents with real-time operational metrics for any selected date (default: today).

- **Parameters:**
  - `report_date` (*optional string, format `YYYY-MM-DD`*): The business day to analyze.

- **Structured Output:**
```json
{
  "date": "2026-10-19",
  "total_sales_inr": 28.00,
  "sales_count": 1,
  "breakdown_by_payment": {
    "cash_inr": 28.00,
    "upi_inr": 0.00,
    "credit_inr": 0.00
  },
  "total_expenses_inr": 0.00,
  "cash_drawer": {
    "opening_cash_inr": 5000.00,
    "net_cash_flow_inr": 28.00,
    "expected_closing_cash_inr": 5028.00
  },
  "top_selling_products": [
    { "name": "Maggi 2-Minute Noodles 70g", "quantity_sold": 2.0 }
  ]
}
```

---

## 4. Multilingual & Indic Resolution Architecture

Indian neighborhood retail takes place in local tongues and code-mixed vernaculars. The DukaanVoice MCP layer and frontend simulator incorporate:

1. **Indic Numeral Translation:**
   Automatically parses Unicode Indic digits (`૦-૯` Gujarati, `०-९` Devanagari) and vernacular number words (`પાંચ`, `पांच`, `दोन`, `five`) into standard integer quantities.
2. **Multilingual Product Synonyms:**
   Matches regional vernacular queries to product catalog entries:
   - "મેગી" / "मैगी" ➔ *Maggi 2-Minute Noodles*
   - "મીઠું" / "नमक" ➔ *Tata Salt*
   - "ચા" / "चाय" ➔ *Tata Tea Gold*
   - "તેલ" / "तेल" ➔ *Fortune Sunflower Oil*
   - "લોટ" / "आटा" ➔ *Aashirvaad Shudh Chakki Atta*
3. **Web Speech API & Voice Synthesis:**
   Seamless integration of browser speech recognition and synthesis configured for regional Indian accents and languages.

---

## 5. Verification & Test Suite

The MCP implementation is covered by automated integration tests in [backend/tests/test_mcp.py](file:///c:/Users/RAHUL/Desktop/gautam/DukaanVoice%20AI/backend/tests/test_mcp.py) and frontend unit tests in [frontend/src/mcpClient.test.js](file:///c:/Users/RAHUL/Desktop/gautam/DukaanVoice%20AI/frontend/src/mcpClient.test.js):

- **Protocol Negotiation:** Validates protocol version `2025-11-25` and `Mcp-Session-Id` header presence.
- **Safety Verification:** Validates that `record_sale(confirm=False)` causes 0 change in database inventory.
- **Atomic Commits:** Validates that `record_sale(confirm=True)` decrements stock and writes ledger entries.
- **Overselling Guardrails:** Verifies that requesting more than existing stock returns structured error `INSUFFICIENT_STOCK`.
- **Supplier Purchases:** Verifies that `record_purchase(confirm=True)` increments inventory atomically.
- **Daily Reporting:** Verifies mathematical coherence of cash closing and sales breakdown.
- **Vernacular Resolution:** Tests Gujarati and Hindi search query resolution.

To run the full suite:
```bash
# Backend MCP tests (11/11 passed)
cd backend
.venv\Scripts\pytest tests/test_mcp.py -v

# Frontend MCP client tests (54/54 passed)
cd ../frontend
npm.cmd test
```
