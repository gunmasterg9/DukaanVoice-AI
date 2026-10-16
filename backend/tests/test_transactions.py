"""Tests for sales and purchase transactions, confirmation, stock auditing, unit conversions, and reversal."""

from __future__ import annotations

import sqlite3
import pytest
from fastapi.testclient import TestClient

from app.database import connect
from app.main import create_app


def _seed_products(client: TestClient) -> dict[str, int]:
    """Helper to seed products and conversion rules for testing."""
    # 1. Sugar: 100 kg (100,000 milli-units), buy 4000 paise (₹40), sell 4500 paise (₹45)
    r1 = client.post("/api/products", json={
        "name": "Sugar",
        "sku": "SKU-SUGAR-01",
        "category": "Groceries",
        "base_unit": "kg",
        "opening_stock": 100000,
        "purchase_price": 4000,
        "selling_price": 4500,
        "low_stock_threshold": 10000,
    })
    sugar_id = r1.json()["id"]

    # Unit conversion: 1 bag = 50 kg (50,000 milli-units)
    client.post(f"/api/products/{sugar_id}/conversions", json={
        "from_unit": "bag",
        "to_unit": "kg",
        "factor": 50000,
    })

    # 2. Soap: 50 pieces, buy ₹20 (2000 paise), sell ₹25 (2500 paise)
    r2 = client.post("/api/products", json={
        "name": "Lifebuoy Soap",
        "sku": "SKU-SOAP-01",
        "category": "Personal Care",
        "base_unit": "piece",
        "opening_stock": 50000,
        "purchase_price": 2000,
        "selling_price": 2500,
        "low_stock_threshold": 5000,
    })
    soap_id = r2.json()["id"]

    # Unit conversion: 1 carton = 24 pieces
    client.post(f"/api/products/{soap_id}/conversions", json={
        "from_unit": "carton",
        "to_unit": "piece",
        "factor": 24000,
    })

    return {"sugar": sugar_id, "soap": soap_id}


def test_draft_creation_does_not_change_stock(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        # Initial stock is 100 kg
        p_before = client.get(f"/api/products/{sugar_id}").json()
        assert p_before["stock_qty"] == 100000

        # Create draft sale of 20 kg
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {
                    "product_id": sugar_id,
                    "quantity": 20000,  # 20 kg
                    "unit": "kg",
                    "unit_price": 4500,  # ₹45.00
                }
            ],
            "original_instruction": "Customer bought 20kg sugar",
        })
        assert res.status_code == 201
        tx = res.json()
        assert tx["status"] == "draft"
        assert tx["total_amount"] == 90000  # 20 * 4500 = 90,000 paise (₹900.00)

        # Stock must NOT have changed
        p_after = client.get(f"/api/products/{sugar_id}").json()
        assert p_after["stock_qty"] == 100000

        # No inventory movement with transaction_id should exist
        conn = connect(initialized_db)
        try:
            count = conn.execute(
                "SELECT COUNT(*) FROM inventory_movements WHERE transaction_id = ?",
                (tx["id"],),
            ).fetchone()[0]
            assert count == 0
        finally:
            conn.close()


def test_confirmed_sale_decreases_stock_correctly(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        # Create draft sale of 10 kg
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {
                    "product_id": sugar_id,
                    "quantity": 10000,
                    "unit": "kg",
                    "unit_price": 4500,
                }
            ],
        })
        tx_id = res.json()["id"]

        # Confirm transaction
        res_conf = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf.status_code == 200
        tx_data = res_conf.json()
        assert tx_data["status"] == "confirmed"
        assert tx_data["confirmed_at"] is not None
        assert len(tx_data["movements"]) == 1

        # Check movement details
        mov = tx_data["movements"][0]
        assert mov["movement_type"] == "sale"
        assert mov["quantity_change"] == -10000
        assert mov["stock_before"] == 100000
        assert mov["stock_after"] == 90000

        # Product stock should now be 90 kg
        prod = client.get(f"/api/products/{sugar_id}").json()
        assert prod["stock_qty"] == 90000


def test_confirmed_purchase_increases_stock_correctly(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        soap_id = prods["soap"]

        # Initial stock: 50 pieces
        # Purchase 20 pieces at ₹18.00 (1800 paise)
        res = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [
                {
                    "product_id": soap_id,
                    "quantity": 20000,
                    "unit": "piece",
                    "unit_price": 1800,
                }
            ],
        })
        tx_id = res.json()["id"]

        res_conf = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf.status_code == 200
        tx_data = res_conf.json()
        assert tx_data["status"] == "confirmed"
        assert tx_data["total_amount"] == 36000  # 20 * 1800 = 36000 paise (₹360.00)

        mov = tx_data["movements"][0]
        assert mov["movement_type"] == "purchase"
        assert mov["quantity_change"] == 20000
        assert mov["stock_before"] == 50000
        assert mov["stock_after"] == 70000

        prod = client.get(f"/api/products/{soap_id}").json()
        assert prod["stock_qty"] == 70000


def test_unit_conversions_applied_correctly(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        soap_id = prods["soap"]  # base_unit = piece, 1 carton = 24 pieces

        # Sell 2 cartons (should deduct 48 pieces = 48,000 milli-units)
        # Price: ₹500 per carton (50000 paise)
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {
                    "product_id": soap_id,
                    "quantity": 2000,  # 2 cartons
                    "unit": "carton",
                    "unit_price": 50000,
                }
            ],
        })
        assert res.status_code == 201
        tx = res.json()
        assert tx["items"][0]["base_quantity"] == 48000
        assert tx["total_amount"] == 100000  # 2 * 50,000 = ₹1,000.00 (100,000 paise)

        # Confirm sale
        res_conf = client.patch(f"/api/transactions/{tx['id']}/confirm")
        assert res_conf.status_code == 200

        # Stock before was 50,000; after deducting 48,000 -> 2,000 left
        prod = client.get(f"/api/products/{soap_id}").json()
        assert prod["stock_qty"] == 2000


def test_invalid_conversion_rule_rejected(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]  # base_unit = kg, has 'bag' conversion, but NOT 'barrel'

        # Try creating draft with unknown unit 'barrel'
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {
                    "product_id": sugar_id,
                    "quantity": 1000,
                    "unit": "barrel",
                    "unit_price": 10000,
                }
            ],
        })
        assert res.status_code == 400
        assert "no explicit unit conversion rule found" in res.json()["detail"].lower()


def test_insufficient_stock_blocks_sale(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]  # stock: 100 kg (100,000 milli-units)

        # Try to sell 150 kg
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {
                    "product_id": sugar_id,
                    "quantity": 150000,  # 150 kg
                    "unit": "kg",
                    "unit_price": 4500,
                }
            ],
        })
        assert res.status_code == 201
        tx_id = res.json()["id"]

        # Confirm should fail due to insufficient stock
        res_conf = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf.status_code == 400
        assert "insufficient stock" in res_conf.json()["detail"].lower()

        # Product stock is untouched
        prod = client.get(f"/api/products/{sugar_id}").json()
        assert prod["stock_qty"] == 100000

        # Transaction remains in 'draft' status
        tx = client.get(f"/api/transactions/{tx_id}").json()
        assert tx["status"] == "draft"


def test_duplicate_idempotency_keys_cannot_duplicate_transaction(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        payload = {
            "type": "sale",
            "items": [
                {"product_id": sugar_id, "quantity": 5000, "unit": "kg", "unit_price": 4500}
            ],
            "idempotency_key": "TX-ORDER-12345",
        }

        # First request
        res1 = client.post("/api/transactions", json=payload)
        assert res1.status_code == 201
        tx1 = res1.json()

        # Retry with same idempotency key returns existing transaction
        res2 = client.post("/api/transactions", json=payload)
        assert res2.status_code == 201 or res2.status_code == 200
        tx2 = res2.json()
        assert tx1["id"] == tx2["id"]

        # Total transactions in DB must still be 1
        list_res = client.get("/api/transactions").json()
        assert list_res["total"] == 1

        # Key conflict with different type returns 409
        conflict_payload = {
            "type": "purchase",
            "items": [
                {"product_id": sugar_id, "quantity": 5000, "unit": "kg", "unit_price": 4500}
            ],
            "idempotency_key": "TX-ORDER-12345",
        }
        res3 = client.post("/api/transactions", json=conflict_payload)
        assert res3.status_code == 409


def test_repeated_confirmation_cannot_duplicate_inventory_movements(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]  # 100 kg

        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": sugar_id, "quantity": 10000, "unit": "kg", "unit_price": 4500}
            ],
        })
        tx_id = res.json()["id"]

        # Confirm 1st time
        res_conf1 = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf1.status_code == 200
        assert res_conf1.json()["status"] == "confirmed"

        # Stock is 90 kg
        prod = client.get(f"/api/products/{sugar_id}").json()
        assert prod["stock_qty"] == 90000

        # Confirm 2nd time (idempotent retry)
        res_conf2 = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf2.status_code == 200
        assert res_conf2.json()["status"] == "confirmed"

        # Stock must STILL be 90 kg (not 80 kg!)
        prod_again = client.get(f"/api/products/{sugar_id}").json()
        assert prod_again["stock_qty"] == 90000

        # Number of inventory movements for this transaction is exactly 1
        conn = connect(initialized_db)
        try:
            count = conn.execute(
                "SELECT COUNT(*) FROM inventory_movements WHERE transaction_id = ?",
                (tx_id,),
            ).fetchone()[0]
            assert count == 1
        finally:
            conn.close()


def test_database_failures_rollback_all_related_writes(initialized_db, monkeypatch):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]
        soap_id = prods["soap"]

        # Create multi-item sale
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": sugar_id, "quantity": 10000, "unit": "kg", "unit_price": 4500},
                {"product_id": soap_id, "quantity": 100000, "unit": "piece", "unit_price": 2500}, # Exceeds 50 pieces stock!
            ],
        })
        tx_id = res.json()["id"]

        # Confirmation must fail on soap, and sugar stock must NOT be deducted
        res_conf = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert res_conf.status_code == 400

        # Verify sugar stock was rolled back and is still 100 kg
        p_sugar = client.get(f"/api/products/{sugar_id}").json()
        assert p_sugar["stock_qty"] == 100000

        # Transaction status is still draft
        tx = client.get(f"/api/transactions/{tx_id}").json()
        assert tx["status"] == "draft"


def test_inactive_products_cannot_be_used_in_new_drafts(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        # Deactivate sugar
        client.patch(f"/api/products/{sugar_id}/deactivate")

        # Attempt to create transaction with inactive product
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": sugar_id, "quantity": 5000, "unit": "kg", "unit_price": 4500}
            ],
        })
        assert res.status_code == 400
        assert "inactive" in res.json()["detail"].lower()


def test_missing_products_and_invalid_states_produce_correct_errors(initialized_db):
    with TestClient(create_app()) as client:
        # 1. Non-existent product ID
        res1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": 999999, "quantity": 1000, "unit": "kg", "unit_price": 100}
            ],
        })
        assert res1.status_code == 404

        # 2. Non-existent transaction ID confirmation
        res2 = client.patch("/api/transactions/888888/confirm")
        assert res2.status_code == 404

        # 3. Non-existent transaction ID reversal
        res3 = client.post("/api/transactions/888888/reverse")
        assert res3.status_code == 404

        # 4. Reverse an unconfirmed draft
        prods = _seed_products(client)
        tx_draft = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": prods["sugar"], "quantity": 1000, "unit": "kg", "unit_price": 4500}],
        }).json()
        res4 = client.post(f"/api/transactions/{tx_draft['id']}/reverse")
        assert res4.status_code == 400
        assert "unconfirmed draft" in res4.json()["detail"].lower()


def test_monetary_calculations_remain_correct_in_integer_paise(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        # Quantity: 2.5 kg (2500 milli-units), Price: ₹45.50/kg (4550 paise)
        # Expected line total: (2500 * 4550) // 1000 = 11375 paise (₹113.75)
        res = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": sugar_id, "quantity": 2500, "unit": "kg", "unit_price": 4550}
            ],
        })
        assert res.status_code == 201
        tx = res.json()
        assert tx["items"][0]["line_total"] == 11375
        assert tx["total_amount"] == 11375


def test_reversal_creates_compensating_movements(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]  # 100 kg

        # 1. Sale of 20 kg
        tx = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": sugar_id, "quantity": 20000, "unit": "kg", "unit_price": 4500}],
        }).json()
        client.patch(f"/api/transactions/{tx['id']}/confirm")

        p_after_sale = client.get(f"/api/products/{sugar_id}").json()
        assert p_after_sale["stock_qty"] == 80000

        # 2. Reverse the sale
        res_rev = client.post(f"/api/transactions/{tx['id']}/reverse")
        assert res_rev.status_code == 200
        rev_data = res_rev.json()
        assert rev_data["status"] == "reversed"
        assert len(rev_data["movements"]) == 2  # original sale + reversal

        comp_mov = rev_data["movements"][-1]
        assert comp_mov["movement_type"] == "reversal"
        assert comp_mov["quantity_change"] == 20000  # Compensating +20 kg
        assert comp_mov["stock_before"] == 80000
        assert comp_mov["stock_after"] == 100000

        # Stock is back to 100 kg
        p_after_rev = client.get(f"/api/products/{sugar_id}").json()
        assert p_after_rev["stock_qty"] == 100000


def test_duplicate_reversal_is_rejected(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        soap_id = prods["soap"]

        tx = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{"product_id": soap_id, "quantity": 10000, "unit": "piece", "unit_price": 2000}],
        }).json()
        client.patch(f"/api/transactions/{tx['id']}/confirm")

        # 1st reversal succeeds
        res1 = client.post(f"/api/transactions/{tx['id']}/reverse")
        assert res1.status_code == 200

        # 2nd reversal fails
        res2 = client.post(f"/api/transactions/{tx['id']}/reverse")
        assert res2.status_code == 400
        assert "already reversed" in res2.json()["detail"].lower()


def test_purchase_reversal_insufficient_stock_fails_safely(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        soap_id = prods["soap"]  # 50 pieces

        # 1. Purchase 10 pieces -> stock becomes 60
        tx_buy = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{"product_id": soap_id, "quantity": 10000, "unit": "piece", "unit_price": 2000}],
        }).json()
        client.patch(f"/api/transactions/{tx_buy['id']}/confirm")
        assert client.get(f"/api/products/{soap_id}").json()["stock_qty"] == 60000

        # 2. Sell 55 pieces -> stock becomes 5 pieces
        tx_sell = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": soap_id, "quantity": 55000, "unit": "piece", "unit_price": 2500}],
        }).json()
        client.patch(f"/api/transactions/{tx_sell['id']}/confirm")
        assert client.get(f"/api/products/{soap_id}").json()["stock_qty"] == 5000

        # 3. Try to reverse the purchase of 10 pieces when only 5 are in stock
        # Reversing would take stock to -5, which violates constraint and must fail cleanly!
        res_rev = client.post(f"/api/transactions/{tx_buy['id']}/reverse")
        assert res_rev.status_code == 400
        assert "insufficient stock" in res_rev.json()["detail"].lower()

        # Stock remains at 5000 and status remains confirmed
        assert client.get(f"/api/products/{soap_id}").json()["stock_qty"] == 5000
        assert client.get(f"/api/transactions/{tx_buy['id']}").json()["status"] == "confirmed"


def test_transaction_history_matches_inventory_movements(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]

        # Create 2 sales, confirm 1
        tx1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": sugar_id, "quantity": 5000, "unit": "kg", "unit_price": 4500}],
        }).json()
        client.patch(f"/api/transactions/{tx1['id']}/confirm")

        tx2 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": sugar_id, "quantity": 10000, "unit": "kg", "unit_price": 4500}],
        }).json()

        # Filter transactions
        list_all = client.get("/api/transactions").json()
        assert list_all["total"] == 2
        assert list_all["total_revenue"] == 22500  # only confirmed sale (5000 * 4500 // 1000)

        list_confirmed = client.get("/api/transactions?status=confirmed").json()
        assert list_confirmed["total"] == 1
        assert list_confirmed["items"][0]["id"] == tx1["id"]

        list_draft = client.get("/api/transactions?status=draft").json()
        assert list_draft["total"] == 1
        assert list_draft["items"][0]["id"] == tx2["id"]


def test_existing_product_data_remains_intact(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_products(client)
        sugar_id = prods["sugar"]
        soap_id = prods["soap"]

        # Run transactions
        tx = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{"product_id": sugar_id, "quantity": 1000, "unit": "kg", "unit_price": 4500}],
        }).json()
        client.patch(f"/api/transactions/{tx['id']}/confirm")

        # Verify product catalog data (SKU, names, categories, threshold) are unchanged
        p_sugar = client.get(f"/api/products/{sugar_id}").json()
        assert p_sugar["sku"] == "SKU-SUGAR-01"
        assert p_sugar["category"] == "Groceries"
        assert p_sugar["low_stock_threshold"] == 10000

        p_soap = client.get(f"/api/products/{soap_id}").json()
        assert p_soap["sku"] == "SKU-SOAP-01"
        assert p_soap["category"] == "Personal Care"


def test_multi_line_same_product_aggregate_stock_confirmation(initialized_db):
    """Regression test: transaction with multiple lines for the same product must aggregate stock and prevent stale overwrites."""
    with TestClient(create_app()) as client:
        # Create product with 10 units (10,000 milli-units)
        p = client.post("/api/products", json={
            "name": "Basmati Rice 1kg",
            "base_unit": "packet",
            "opening_stock": 10000,
            "selling_price": 9000,
        }).json()
        p_id = p["id"]

        # Draft sale with TWO lines for the same product: 3 packets and 4 packets (Total: 7 packets)
        tx = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": p_id, "quantity": 3000, "unit": "packet", "unit_price": 9000},
                {"product_id": p_id, "quantity": 4000, "unit": "packet", "unit_price": 9000},
            ],
        }).json()
        tx_id = tx["id"]
        assert len(tx["items"]) == 2

        # Confirm transaction
        conf_res = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert conf_res.status_code == 200
        conf_data = conf_res.json()
        assert conf_data["status"] == "confirmed"

        # Stock must be exactly 10,000 - 3,000 - 4,000 = 3,000 milli-units (3 packets)
        p_after = client.get(f"/api/products/{p_id}").json()
        assert p_after["stock_qty"] == 3000

        # Movements must be continuous: 10000 -> 7000 -> 3000
        movements = conf_data["movements"]
        assert len(movements) == 2
        m1 = movements[0]
        m2 = movements[1]
        assert m1["stock_before"] == 10000
        assert m1["quantity_change"] == -3000
        assert m1["stock_after"] == 7000

        assert m2["stock_before"] == 7000
        assert m2["quantity_change"] == -4000
        assert m2["stock_after"] == 3000


def test_multi_line_same_product_aggregate_stock_insufficient(initialized_db):
    """Regression test: transaction with multiple lines must validate total aggregate quantity against available stock."""
    with TestClient(create_app()) as client:
        # Create product with 5 units (5,000 milli-units)
        p = client.post("/api/products", json={
            "name": "Sunflower Oil 1L",
            "base_unit": "bottle",
            "opening_stock": 5000,
            "selling_price": 14000,
        }).json()
        p_id = p["id"]

        # Draft sale with TWO lines: 3 bottles and 3 bottles (Total: 6 bottles > 5 available)
        # Individually each line (3 <= 5) would pass if not aggregated!
        tx = client.post("/api/transactions", json={
            "type": "sale",
            "items": [
                {"product_id": p_id, "quantity": 3000, "unit": "bottle", "unit_price": 14000},
                {"product_id": p_id, "quantity": 3000, "unit": "bottle", "unit_price": 14000},
            ],
        }).json()
        tx_id = tx["id"]

        # Confirm must be rejected with 400 Bad Request
        conf_res = client.patch(f"/api/transactions/{tx_id}/confirm")
        assert conf_res.status_code == 400
        assert "Insufficient stock" in conf_res.json()["detail"]

        # Stock must remain untouched at 5,000 milli-units
        p_after = client.get(f"/api/products/{p_id}").json()
        assert p_after["stock_qty"] == 5000
