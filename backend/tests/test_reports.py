"""Tests for Phase 4 reports: daily sales, purchases, product sales, inventory summary, and reconciliation."""

from __future__ import annotations

import sqlite3
import pytest
from fastapi.testclient import TestClient

from app.database import connect
from app.main import create_app


def _seed_sample_catalog(client: TestClient) -> dict[str, int]:
    """Helper to seed products and conversion rules."""
    # Product 1: Sugar - opening 100 kg (100,000 milli-units), buy 4000 paise (₹40), sell 4500 paise (₹45), threshold 20,000 milli-units
    r1 = client.post("/api/products", json={
        "name": "Sugar",
        "sku": "SKU-SUGAR-REP",
        "category": "Groceries",
        "base_unit": "kg",
        "opening_stock": 100000,
        "purchase_price": 4000,
        "selling_price": 4500,
        "low_stock_threshold": 20000,
    })
    sugar_id = r1.json()["id"]

    # 1 bag = 50 kg (50,000 milli-units)
    client.post(f"/api/products/{sugar_id}/conversions", json={
        "from_unit": "bag",
        "to_unit": "kg",
        "factor": 50000,
    })

    # Product 2: Tea - opening 10 kg (10,000 milli-units), buy 25000 paise (₹250), sell 30000 paise (₹300), threshold 15,000 milli-units (LOW STOCK)
    r2 = client.post("/api/products", json={
        "name": "Tea",
        "sku": "SKU-TEA-REP",
        "category": "Beverages",
        "base_unit": "kg",
        "opening_stock": 10000,
        "purchase_price": 25000,
        "selling_price": 30000,
        "low_stock_threshold": 15000,
    })
    tea_id = r2.json()["id"]

    # Product 3: Salt - opening 0 kg, buy 1500 paise, sell 2000 paise, threshold 5,000 milli-units
    r3 = client.post("/api/products", json={
        "name": "Salt",
        "sku": "SKU-SALT-REP",
        "category": "Groceries",
        "base_unit": "kg",
        "opening_stock": 0,
        "purchase_price": 1500,
        "selling_price": 2000,
        "low_stock_threshold": 5000,
    })
    salt_id = r3.json()["id"]

    return {"sugar": sugar_id, "tea": tea_id, "salt": salt_id}


def test_daily_sales_empty(initialized_db):
    with TestClient(create_app()) as client:
        res = client.get("/api/reports/sales/daily")
        assert res.status_code == 200
        data = res.json()
        assert data["total_revenue"] == 0
        assert data["total_transactions"] == 0
        assert data["gross_revenue"] == 0
        assert data["reversed_revenue"] == 0
        assert data["reversed_count"] == 0
        assert data["days"] == []


def test_daily_sales_confirmed_and_draft_exclusion(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # 1. Create a draft sale (should be excluded)
        client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 5000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        })

        # 2. Create and confirm a sale: 10 kg sugar @ ₹45 = ₹450 (45,000 paise)
        t1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 10000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        # 3. Create and confirm another sale: 2 kg tea @ ₹300 = ₹600 (60,000 paise)
        t2 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["tea"],
                "quantity": 2000,
                "unit": "kg",
                "unit_price": 30000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t2['id']}/confirm")

        res = client.get("/api/reports/sales/daily")
        assert res.status_code == 200
        data = res.json()
        # Total revenue = 45,000 + 60,000 = 105,000 paise (₹1050)
        assert data["total_revenue"] == 105000
        assert data["total_transactions"] == 2
        assert data["gross_revenue"] == 105000
        assert data["reversed_revenue"] == 0
        assert data["reversed_count"] == 0
        assert len(data["days"]) == 1
        day = data["days"][0]
        assert day["net_revenue"] == 105000
        assert day["confirmed_count"] == 2
        assert day["reversed_revenue"] == 0


def test_daily_sales_reversed_handling(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Create and confirm sale 1: ₹450 (45,000 paise)
        t1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 10000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        # Create, confirm, then reverse sale 2: ₹300 (30,000 paise)
        t2 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["tea"],
                "quantity": 1000,
                "unit": "kg",
                "unit_price": 30000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t2['id']}/confirm")
        client.post(f"/api/transactions/{t2['id']}/reverse")

        res = client.get("/api/reports/sales/daily")
        assert res.status_code == 200
        data = res.json()
        # Net revenue should be only t1: 45,000 paise
        assert data["total_revenue"] == 45000
        assert data["total_transactions"] == 1
        # Gross revenue includes reversed: 45,000 + 30,000 = 75,000 paise
        assert data["gross_revenue"] == 75000
        assert data["reversed_revenue"] == 30000
        assert data["reversed_count"] == 1

        day = data["days"][0]
        assert day["net_revenue"] == 45000
        assert day["confirmed_count"] == 1
        assert day["reversed_revenue"] == 30000
        assert day["reversed_count"] == 1


def test_purchases_report_and_reversals(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Draft purchase (excluded)
        client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 20000,
                "unit": "kg",
                "unit_price": 4000,
            }],
        })

        # Confirmed purchase 1: 50 kg sugar @ ₹40 = ₹2,000 (200,000 paise)
        t1 = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 50000,
                "unit": "kg",
                "unit_price": 4000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        # Confirmed and reversed purchase 2: 10 kg tea @ ₹250 = ₹2,500 (250,000 paise)
        t2 = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{
                "product_id": prods["tea"],
                "quantity": 10000,
                "unit": "kg",
                "unit_price": 25000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t2['id']}/confirm")
        client.post(f"/api/transactions/{t2['id']}/reverse")

        res = client.get("/api/reports/purchases")
        assert res.status_code == 200
        data = res.json()
        assert data["total_expenditure"] == 200000
        assert data["total_transactions"] == 1
        assert data["gross_expenditure"] == 450000
        assert data["reversed_expenditure"] == 250000
        assert data["reversed_count"] == 1


def test_product_sales_report_with_unit_conversion(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Sale in product base unit: 5 kg sugar @ ₹45/kg = ₹225 (22,500 paise)
        t1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 5000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        # Sale using explicit unit conversion: 1 bag sugar (= 50 kg = 50,000 milli-units) @ ₹2200 = ₹2200 (220,000 paise)
        t2 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 1000,
                "unit": "bag",
                "unit_price": 220000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t2['id']}/confirm")

        res = client.get("/api/reports/products")
        assert res.status_code == 200
        data = res.json()
        assert data["total_sales_value"] == 22500 + 220000
        assert data["total_products_sold"] == 1

        sugar_item = next(it for it in data["items"] if it["product_id"] == prods["sugar"])
        # Total base quantity sold = 5,000 + 50,000 = 55,000 milli-units (55 kg)
        assert sugar_item["quantity_sold"] == 55000
        assert sugar_item["base_unit"] == "kg"
        assert sugar_item["total_sales_value"] == 242500
        assert sugar_item["transaction_count"] == 2


def test_inventory_summary_report(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Perform a sale on sugar (10 kg)
        t1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 10000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        res = client.get("/api/reports/inventory")
        assert res.status_code == 200
        data = res.json()
        assert data["total_products"] == 3
        # Tea has 10,000 <= 15,000 threshold, Salt has 0 <= 5,000 threshold -> 2 low stock
        assert data["low_stock_count"] == 2

        sugar_item = next(it for it in data["items"] if it["product_id"] == prods["sugar"])
        # Sugar stock: 100,000 opening - 10,000 sold = 90,000 milli-units (90 kg)
        assert sugar_item["stock_qty"] == 90000
        assert sugar_item["total_inflow"] == 100000  # opening adjustment
        assert sugar_item["total_outflow"] == 10000  # sale
        assert sugar_item["is_low_stock"] is False
        assert len(sugar_item["conversions"]) == 1

        # Check total inventory valuations in integer paise:
        # Sugar: 90 kg * ₹40 = ₹3,600 (360,000 paise) cost; 90 kg * ₹45 = ₹4,050 (405,000 paise) selling
        # Tea: 10 kg * ₹250 = ₹2,500 (250,000 paise) cost; 10 kg * ₹300 = ₹3,000 (300,000 paise) selling
        # Salt: 0 * 1500 = 0
        expected_cost = 360000 + 250000
        expected_sell = 405000 + 300000
        assert data["total_inventory_cost_value"] == expected_cost
        assert data["total_inventory_selling_value"] == expected_sell


def test_reconciliation_report_reconciled(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Confirm a purchase and a sale on sugar
        t_buy = client.post("/api/transactions", json={
            "type": "purchase",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 20000,
                "unit": "kg",
                "unit_price": 4000,
            }],
        }).json()
        client.patch(f"/api/transactions/{t_buy['id']}/confirm")

        t_sale = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 30000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t_sale['id']}/confirm")

        res = client.get("/api/reports/reconciliation")
        assert res.status_code == 200
        data = res.json()
        sugar_item = next(it for it in data["items"] if it["product_id"] == prods["sugar"])
        assert sugar_item["status"] == "reconciled"
        assert sugar_item["discrepancy"] == 0
        assert sugar_item["recorded_stock"] == 90000  # 100k + 20k - 30k
        assert sugar_item["calculated_stock"] == 90000
        assert sugar_item["movements_count"] == 3  # opening + buy + sale
        assert len(sugar_item["issues"]) == 0


def test_reconciliation_report_no_movements(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        res = client.get(f"/api/reports/reconciliation?product_id={prods['salt']}")
        assert res.status_code == 200
        data = res.json()
        salt_item = data["items"][0]
        # Salt was created with 0 stock and no transactions
        assert salt_item["status"] == "no_movements"
        assert salt_item["recorded_stock"] == 0
        assert salt_item["calculated_stock"] == 0
        assert salt_item["discrepancy"] == 0
        assert salt_item["movements_count"] == 0


def test_reconciliation_report_detects_unrecorded_stock(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Directly tamper with product stock in SQLite to simulate unrecorded stock
        conn = connect(initialized_db)
        conn.execute("UPDATE products SET stock_qty = 50000 WHERE id = ?", (prods["salt"],))
        conn.commit()
        conn.close()

        res = client.get(f"/api/reports/reconciliation?product_id={prods['salt']}")
        assert res.status_code == 200
        data = res.json()
        salt_item = data["items"][0]
        assert salt_item["status"] == "discrepancy"
        assert salt_item["recorded_stock"] == 50000
        assert salt_item["calculated_stock"] == 0
        assert salt_item["discrepancy"] == 50000
        assert any("Unrecorded stock" in iss for iss in salt_item["issues"])


def test_reconciliation_report_detects_continuity_gap(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Insert a corrupt movement with a jump in stock_before
        conn = connect(initialized_db)
        conn.execute(
            """
            INSERT INTO inventory_movements (
                product_id, transaction_id, movement_type, quantity_change,
                stock_before, stock_after, created_at
            )
            VALUES (?, NULL, 'adjustment', 5000, 150000, 155000, datetime('now'))
            """,
            (prods["sugar"],),
        )
        conn.commit()
        conn.close()

        res = client.get(f"/api/reports/reconciliation?product_id={prods['sugar']}")
        assert res.status_code == 200
        data = res.json()
        sugar_item = data["items"][0]
        assert sugar_item["status"] == "gap_detected"
        assert any("Continuity gap" in iss for iss in sugar_item["issues"])


def test_inventory_movements_endpoint(initialized_db):
    with TestClient(create_app()) as client:
        prods = _seed_sample_catalog(client)

        # Confirm a sale on sugar
        t1 = client.post("/api/transactions", json={
            "type": "sale",
            "items": [{
                "product_id": prods["sugar"],
                "quantity": 10000,
                "unit": "kg",
                "unit_price": 4500,
            }],
        }).json()
        client.patch(f"/api/transactions/{t1['id']}/confirm")

        res = client.get("/api/reports/inventory/movements?movement_type=sale")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        m = data["items"][0]
        assert m["product_sku"] == "SKU-SUGAR-REP"
        assert m["movement_type"] == "sale"
        assert m["quantity_change"] == -10000
        assert m["stock_before"] == 100000
        assert m["stock_after"] == 90000
