"""Comprehensive tests for MCP Server boundary and retail tools.

Verifies:
1. MCP Protocol version 2025-11-25 initialization and capability negotiation.
2. Mcp-Session-Id generation and session tracking.
3. tools/list discovery of get_inventory, record_sale, record_purchase, get_daily_report.
4. get_inventory query, SKU search, and low-stock filtering.
5. record_sale two-step workflow: proposal (draft, zero stock change) and confirmation (atomic deduction).
6. record_sale insufficient stock rejection without partial mutation.
7. record_purchase stock receipt and inventory movement.
8. get_daily_report deterministic date boundary and sales calculation.
9. Idempotency and duplicate prevention.
"""

from __future__ import annotations

import json
from datetime import date

import pytest
from starlette.testclient import TestClient

from app.database import connection
from app.main import create_app
from app.routers.products import create_product
from app.schemas.product import ProductCreate


@pytest.fixture
def client(initialized_db):
    """Test client wrapping the full FastAPI application with MCP server mounted."""
    app = create_app()
    with TestClient(app, follow_redirects=True) as test_client:
        yield test_client


def _init_mcp_session(client: TestClient) -> tuple[str, dict[str, str]]:
    """Helper to initialize an MCP session and return session_id and headers."""
    res = client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "alexa-test-client", "version": "1.0.0"},
            },
        },
    )
    assert res.status_code == 200, f"Init failed: {res.text}"
    data = res.json()
    assert data["jsonrpc"] == "2.0"
    assert data["result"]["protocolVersion"] == "2025-11-25"
    assert data["result"]["serverInfo"]["name"] == "dukaanvoice-alexa-plus"

    session_id = res.headers.get("mcp-session-id")
    assert session_id is not None and len(session_id) > 0
    headers = {"mcp-session-id": session_id}

    # Send initialized notification
    notif_res = client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    assert notif_res.status_code in (200, 202, 204)

    return session_id, headers


def test_mcp_protocol_initialization_and_session(client):
    """Verify MCP protocol version 2025-11-25 handshake and Mcp-Session-Id."""
    session_id, headers = _init_mcp_session(client)
    assert session_id is not None


def test_mcp_tool_discovery(client):
    """Verify tools/list exposes all 4 retail tools with valid JSON schemas."""
    _, headers = _init_mcp_session(client)

    res = client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert res.status_code == 200
    data = res.json()
    tools = data["result"]["tools"]
    tool_names = [t["name"] for t in tools]

    assert "get_inventory" in tool_names
    assert "record_sale" in tool_names
    assert "record_purchase" in tool_names
    assert "get_daily_report" in tool_names

    # Verify record_sale schema includes required parameters
    sale_tool = next(t for t in tools if t["name"] == "record_sale")
    props = sale_tool["inputSchema"]["properties"]
    assert "product_name_or_sku" in props
    assert "quantity" in props
    assert "confirm" in props


def test_mcp_get_inventory_tool(client):
    """Verify get_inventory tool finds products, SKU, stock levels, and threshold filters."""
    # Create test products
    create_product(
        ProductCreate(
            name="Parle-G Glucose Biscuit",
            sku="PARLE-G-100",
            category="Biscuits",
            opening_stock=40000,  # 40 units
            base_unit="packet",
            selling_price=1000,   # ₹10.00
            purchase_price=800,   # ₹8.00
            low_stock_threshold=10000,
        )
    )
    create_product(
        ProductCreate(
            name="Tata Tea Premium",
            sku="TEA-TATA-250",
            category="Beverages",
            opening_stock=5000,   # 5 units (low stock!)
            base_unit="packet",
            selling_price=12000,  # ₹120.00
            purchase_price=9500,  # ₹95.00
            low_stock_threshold=10000, # threshold 10 units
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Search by name query
    call_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 10,
            "method": "tools/call",
            "params": {
                "name": "get_inventory",
                "arguments": {"query": "Parle-G"},
            },
        },
    )
    assert call_res.status_code == 200
    content = json.loads(call_res.json()["result"]["content"][0]["text"])
    assert content["total_found"] == 1
    prod = content["products"][0]
    assert prod["name"] == "Parle-G Glucose Biscuit"
    assert prod["stock_quantity"] == 40.0
    assert prod["base_unit"] == "packet"
    assert prod["selling_price_rupees"] == "₹10.00"
    assert prod["is_low_stock"] is False

    # 2. Search low stock only
    low_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 11,
            "method": "tools/call",
            "params": {
                "name": "get_inventory",
                "arguments": {"low_stock_only": True},
            },
        },
    )
    assert low_res.status_code == 200
    low_content = json.loads(low_res.json()["result"]["content"][0]["text"])
    assert low_content["total_found"] >= 1
    tea_prod = next(p for p in low_content["products"] if p["sku"] == "TEA-TATA-250")
    assert tea_prod["is_low_stock"] is True
    assert tea_prod["stock_quantity"] == 5.0


def test_mcp_record_sale_proposal_safety(client):
    """Verify record_sale with confirm=false returns proposal and LEAVES DATABASE STOCK UNCHANGED."""
    prod = create_product(
        ProductCreate(
            name="Amul Butter 100g",
            sku="AMUL-BUTTER-100",
            opening_stock=50000,  # 50 packets
            base_unit="packet",
            selling_price=5500,   # ₹55.00
        )
    )

    _, headers = _init_mcp_session(client)

    # Call record_sale in PROPOSAL mode (confirm=False)
    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 20,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "AMUL-BUTTER-100",
                    "quantity": 5.0,
                    "confirm": False,
                },
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])

    assert data["status"] == "proposal"
    assert data["draft_id"] is not None
    assert data["current_stock"] == 50.0
    assert data["proposed_stock"] == 45.0
    assert data["total_amount_rupees"] == "₹275.00"

    # CRITICAL INVARIANT: Verify stock in database is STILL 50000 milli-units (50.0)!
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 50000

        # Verify transaction status is 'draft'
        tx = conn.execute("SELECT status FROM transactions WHERE id = ?", (data["draft_id"],)).fetchone()
        assert tx["status"] == "draft"


def test_mcp_record_sale_confirmation_flow(client):
    """Verify confirming a proposed draft atomically commits the sale and updates inventory."""
    prod = create_product(
        ProductCreate(
            name="Fortune Sunlite Oil 1L",
            sku="OIL-FORTUNE-1L",
            opening_stock=20000,  # 20 litres
            base_unit="litre",
            selling_price=16000,  # ₹160.00
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Proposal
    prop_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 30,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "Fortune Sunlite Oil",
                    "quantity": 3.0,
                    "confirm": False,
                },
            },
        },
    )
    prop_data = json.loads(prop_res.json()["result"]["content"][0]["text"])
    draft_id = prop_data["draft_id"]

    # 2. Confirm using the draft_id
    conf_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 31,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "Fortune Sunlite Oil",
                    "quantity": 3.0,
                    "confirm": True,
                    "draft_id": draft_id,
                },
            },
        },
    )
    assert conf_res.status_code == 200
    conf_data = json.loads(conf_res.json()["result"]["content"][0]["text"])
    assert conf_data["status"] == "confirmed"
    assert conf_data["transaction_id"] == draft_id
    assert conf_data["current_stock"] == 17.0

    # Verify database stock updated to 17000 milli-units (17 litres)
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 17000

        # Verify inventory movement recorded
        mov = conn.execute(
            "SELECT * FROM inventory_movements WHERE transaction_id = ?", (draft_id,)
        ).fetchone()
        assert mov is not None
        assert mov["movement_type"] == "sale"
        assert mov["quantity_change"] == -3000
        assert mov["stock_before"] == 20000
        assert mov["stock_after"] == 17000


def test_mcp_record_sale_insufficient_stock_rejection(client):
    """Verify sale exceeding available stock is rejected cleanly without partial mutations."""
    prod = create_product(
        ProductCreate(
            name="Limited Mango Pickle 500g",
            sku="PICKLE-500",
            opening_stock=2000,  # 2 jars
            base_unit="jar",
            selling_price=15000,
        )
    )

    _, headers = _init_mcp_session(client)

    # Attempt to sell 10 jars when only 2 are available
    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 40,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "Limited Mango Pickle 500g",
                    "quantity": 10.0,
                    "confirm": False,
                },
            },
        },
    )
    assert res.status_code == 200
    call_result = res.json()["result"]
    err_data = json.loads(call_result["content"][0]["text"])
    assert err_data["status"] == "error"
    assert "Insufficient stock" in err_data["message"]

    # Verify database stock is still untouched
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 2000


def test_mcp_record_purchase_flow(client):
    """Verify recording incoming inventory increases stock atomically."""
    prod = create_product(
        ProductCreate(
            name="Aashirvaad Shudh Chakki Atta 5kg",
            sku="ATTA-5KG",
            opening_stock=10000,  # 10 bags
            base_unit="bag",
            selling_price=28000,
            purchase_price=24000, # ₹240.00
        )
    )

    _, headers = _init_mcp_session(client)

    # Direct confirmed purchase receipt of 15 bags
    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 50,
            "method": "tools/call",
            "params": {
                "name": "record_purchase",
                "arguments": {
                    "product_name_or_sku": "ATTA-5KG",
                    "quantity": 15.0,
                    "confirm": True,
                },
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert data["status"] == "confirmed"
    assert data["stock_before"] == 10.0
    assert data["stock_after"] == 25.0

    # Verify database
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 25000  # 25 bags


def test_mcp_get_daily_report_tool(client):
    """Verify get_daily_report summarizes real sales count and revenue."""
    prod = create_product(
        ProductCreate(
            name="Chai Patti 250g",
            sku="TEA-CHAI-250",
            opening_stock=50000,
            base_unit="packet",
            selling_price=9000,  # ₹90.00
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Record a confirmed sale of 2 packets = ₹180.00 (18000 paise)
    client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 60,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "TEA-CHAI-250",
                    "quantity": 2.0,
                    "confirm": True,
                },
            },
        },
    )

    # 2. Query daily report
    today_str = date.today().isoformat()
    rep_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 61,
            "method": "tools/call",
            "params": {
                "name": "get_daily_report",
                "arguments": {"business_date": today_str},
            },
        },
    )
    assert rep_res.status_code == 200
    report = json.loads(rep_res.json()["result"]["content"][0]["text"])

    assert report["business_date"] == today_str
    assert report["confirmed_sales_count"] == 1
    assert report["total_revenue_paise"] == 18000
    assert report["total_revenue_rupees"] == "₹180.00"


def test_mcp_record_sale_idempotency(client):
    """Verify duplicate submission with the same idempotency_key returns cached transaction."""
    prod = create_product(
        ProductCreate(
            name="Haldi Powder 200g",
            sku="HALDI-200",
            opening_stock=10000,
            base_unit="packet",
            selling_price=4500,
        )
    )

    _, headers = _init_mcp_session(client)
    idemp_key = "idemp-test-sale-12345"

    # First proposal
    res1 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 70,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "HALDI-200",
                    "quantity": 2.0,
                    "idempotency_key": idemp_key,
                    "confirm": False,
                },
            },
        },
    )
    assert res1.status_code == 200
    data1 = json.loads(res1.json()["result"]["content"][0]["text"])
    draft_id = data1["draft_id"]

    # Second proposal with same idempotency_key
    res2 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 71,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "HALDI-200",
                    "quantity": 2.0,
                    "idempotency_key": idemp_key,
                    "confirm": False,
                },
            },
        },
    )
    assert res2.status_code == 200
    data2 = json.loads(res2.json()["result"]["content"][0]["text"])
    # Must return the SAME draft_id without creating duplicate transaction
    assert data2["draft_id"] == draft_id


def test_mcp_unknown_product_handling(client):
    """Verify unknown product returns clear structured error message."""
    _, headers = _init_mcp_session(client)

    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 80,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "NonExistentGizmo999",
                    "quantity": 1.0,
                    "confirm": False,
                },
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert data["status"] == "error"
    assert "not found in catalog" in data["message"]


def test_mcp_multilingual_product_resolution(client):
    """Verify authentic Gujarati and Hindi product names resolve accurately via MCP tools."""
    # Gujarati product name
    prod_gu = create_product(
        ProductCreate(
            name="ગુજરાતી પ્રીમિયમ ચા",
            sku="GUJ-CHAI-500",
            opening_stock=30000,
            base_unit="kg",
            selling_price=32000,
        )
    )

    _, headers = _init_mcp_session(client)

    # Search via Gujarati name
    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 90,
            "method": "tools/call",
            "params": {
                "name": "get_inventory",
                "arguments": {"query": "ગુજરાતી પ્રીમિયમ ચા"},
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert data["total_found"] == 1
    assert data["products"][0]["sku"] == "GUJ-CHAI-500"
    assert data["products"][0]["stock_quantity"] == 30.0


def test_mcp_record_purchase_proposal_safety(client):
    """Verify purchase proposal with confirm=false leaves database stock completely unchanged."""
    prod = create_product(
        ProductCreate(
            name="Basmati Rice 5kg",
            sku="RICE-BASMATI-5K",
            opening_stock=10000,  # 10 bags
            base_unit="bag",
            selling_price=45000,
            purchase_price=38000,
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Purchase proposal (confirm=False)
    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 95,
            "method": "tools/call",
            "params": {
                "name": "record_purchase",
                "arguments": {
                    "product_name_or_sku": "RICE-BASMATI-5K",
                    "quantity": 5.0,
                    "confirm": False,
                },
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])

    assert data["status"] == "proposal"
    assert data["draft_id"] is not None
    assert data["current_stock"] == 10.0
    assert data["proposed_stock"] == 15.0

    # Invariant check: Database stock MUST remain 10000 milli-units (10 bags)
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 10000

        # Draft transaction exists with status 'draft'
        tx = conn.execute("SELECT status, type FROM transactions WHERE id = ?", (data["draft_id"],)).fetchone()
        assert tx["status"] == "draft"
        assert tx["type"] == "purchase"


def test_mcp_repeated_confirmation_rejection(client):
    """Verify that confirming an already-confirmed transaction fails safely and never double-deducts stock."""
    prod = create_product(
        ProductCreate(
            name="Sugar 1kg Packet",
            sku="SUGAR-1KG",
            opening_stock=20000,  # 20 kg
            base_unit="kg",
            selling_price=4400,
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Create proposal
    prop_res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 100,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "SUGAR-1KG",
                    "quantity": 2.0,
                    "confirm": False,
                },
            },
        },
    )
    prop_data = json.loads(prop_res.json()["result"]["content"][0]["text"])
    draft_id = prop_data["draft_id"]

    # 2. Confirm once -> Success
    conf_res1 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 101,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "SUGAR-1KG",
                    "quantity": 2.0,
                    "confirm": True,
                    "draft_id": draft_id,
                },
            },
        },
    )
    assert conf_res1.status_code == 200
    conf_data1 = json.loads(conf_res1.json()["result"]["content"][0]["text"])
    assert conf_data1["status"] == "confirmed"
    assert conf_data1["current_stock"] == 18.0

    # Verify database stock is 18000
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 18000

    # 3. Repeated confirmation of the already-confirmed draft must be idempotent and NOT double-deduct stock
    conf_res2 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 102,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "SUGAR-1KG",
                    "quantity": 2.0,
                    "confirm": True,
                    "draft_id": draft_id,
                },
            },
        },
    )
    assert conf_res2.status_code == 200
    conf_data2 = json.loads(conf_res2.json()["result"]["content"][0]["text"])
    assert conf_data2["status"] == "confirmed"

    # CRITICAL INVARIANT: Database stock MUST STILL BE 18000 (not double deducted to 16000)!
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 18000

        # Invariant: inventory movements count for this transaction MUST BE EXACTLY 1 (no duplicate movement)
        movements_count = conn.execute(
            "SELECT COUNT(*) FROM inventory_movements WHERE transaction_id = ?",
            (draft_id,),
        ).fetchone()[0]
        assert movements_count == 1

    # 4. Attempting to confirm a REVERSED transaction must fail safely with an error
    client.patch(f"/api/transactions/{draft_id}/reverse")

    conf_res3 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 103,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "SUGAR-1KG",
                    "quantity": 2.0,
                    "confirm": True,
                    "draft_id": draft_id,
                },
            },
        },
    )
    assert conf_res3.status_code == 200
    conf_data3 = json.loads(conf_res3.json()["result"]["content"][0]["text"])
    assert conf_data3["status"] == "error"
    assert "Cannot confirm a reversed transaction" in conf_data3["message"]


def test_mcp_unknown_method_protocol_error(client):
    """Verify that calling an unknown JSON-RPC method returns a standard error code."""
    _, headers = _init_mcp_session(client)

    res = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 105,
            "method": "nonexistent/custom_method",
            "params": {},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "error" in body
    assert body["error"]["code"] == -32601  # Method not found


def test_mcp_concurrent_oversell_rejection(client):
    """Verify that concurrent or competing proposals cannot oversell stock if stock is exhausted."""
    prod = create_product(
        ProductCreate(
            name="Limited Kesar Mango 1kg",
            sku="MANGO-KESAR-1KG",
            opening_stock=10000,  # 10 kg
            base_unit="kg",
            selling_price=25000,
        )
    )

    _, headers = _init_mcp_session(client)

    # 1. Draft 1 proposes to sell 7 kg (requires 7 kg, 10 available)
    res1 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 110,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "MANGO-KESAR-1KG",
                    "quantity": 7.0,
                    "confirm": False,
                },
            },
        },
    )
    draft1_id = json.loads(res1.json()["result"]["content"][0]["text"])["draft_id"]

    # 2. Draft 2 concurrently proposes to sell 7 kg (requires 7 kg, 10 still in DB because draft 1 didn't mutate)
    res2 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 111,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "MANGO-KESAR-1KG",
                    "quantity": 7.0,
                    "confirm": False,
                },
            },
        },
    )
    draft2_id = json.loads(res2.json()["result"]["content"][0]["text"])["draft_id"]

    # 3. Confirm Draft 1 -> Commits successfully, reduces stock to 3 kg (3000 milli-units)
    conf1 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 112,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "MANGO-KESAR-1KG",
                    "quantity": 7.0,
                    "confirm": True,
                    "draft_id": draft1_id,
                },
            },
        },
    )
    assert conf1.status_code == 200
    data_conf1 = json.loads(conf1.json()["result"]["content"][0]["text"])
    assert data_conf1["status"] == "confirmed"
    assert data_conf1["current_stock"] == 3.0

    # 4. Attempt to confirm Draft 2 -> Must be REJECTED because only 3 kg remains!
    conf2 = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 113,
            "method": "tools/call",
            "params": {
                "name": "record_sale",
                "arguments": {
                    "product_name_or_sku": "MANGO-KESAR-1KG",
                    "quantity": 7.0,
                    "confirm": True,
                    "draft_id": draft2_id,
                },
            },
        },
    )
    assert conf2.status_code == 200
    data_conf2 = json.loads(conf2.json()["result"]["content"][0]["text"])
    assert data_conf2["status"] == "error"
    assert "Insufficient stock" in data_conf2["message"]

    # 5. Invariant check: Database stock MUST strictly remain 3000 milli-units (3.0 kg), never negative!
    with connection(create=False) as conn:
        db_prod = conn.execute("SELECT stock_qty FROM products WHERE id = ?", (prod.id,)).fetchone()
        assert db_prod["stock_qty"] == 3000


