"""Product management, search, deactivation, and unit conversion tests."""

from __future__ import annotations

import sqlite3
import pytest
from fastapi.testclient import TestClient

from app.database import connect
from app.main import create_app


def test_create_product_success_and_initial_inventory_movement(initialized_db):
    with TestClient(create_app()) as client:
        payload = {
            "name": "Tata Salt",
            "sku": "SKU-SALT-01",
            "category": "Groceries",
            "base_unit": "kg",
            "opening_stock": 25000,  # 25 kg
            "purchase_price": 2200,   # ₹22.00
            "selling_price": 2800,    # ₹28.00
            "low_stock_threshold": 5000,  # 5 kg
        }
        res = client.post("/api/products", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["id"] > 0
        assert data["name"] == "Tata Salt"
        assert data["sku"] == "SKU-SALT-01"
        assert data["stock_qty"] == 25000
        assert data["active"] == 1
        assert data["is_low_stock"] is False

        # Verify initial inventory movement in DB
        conn = connect(initialized_db)
        try:
            movement = conn.execute(
                "SELECT * FROM inventory_movements WHERE product_id = ?",
                (data["id"],),
            ).fetchone()
            assert movement is not None
            assert movement["movement_type"] == "adjustment"
            assert movement["quantity_change"] == 25000
            assert movement["stock_before"] == 0
            assert movement["stock_after"] == 25000
            assert movement["transaction_id"] is None
        finally:
            conn.close()


def test_create_product_zero_opening_stock(initialized_db):
    with TestClient(create_app()) as client:
        payload = {
            "name": "Zero Stock Item",
            "sku": "SKU-ZERO-01",
            "base_unit": "piece",
            "opening_stock": 0,
            "purchase_price": 100,
            "selling_price": 150,
            "low_stock_threshold": 2000,
        }
        res = client.post("/api/products", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["stock_qty"] == 0
        assert data["is_low_stock"] is True  # 0 <= 2000

        # When opening_stock == 0, quantity_change <> 0 constraint precludes movement
        conn = connect(initialized_db)
        try:
            movements = conn.execute(
                "SELECT COUNT(*) FROM inventory_movements WHERE product_id = ?",
                (data["id"],),
            ).fetchone()[0]
            assert movements == 0
        finally:
            conn.close()


def test_duplicate_sku_rejected(initialized_db):
    with TestClient(create_app()) as client:
        payload = {
            "name": "Tea Pack",
            "sku": "SKU-TEA-DUP",
            "base_unit": "packet",
            "opening_stock": 1000,
            "purchase_price": 5000,
            "selling_price": 6000,
        }
        res1 = client.post("/api/products", json=payload)
        assert res1.status_code == 201

        # Same SKU exact match
        res2 = client.post("/api/products", json=payload)
        assert res2.status_code == 409
        assert "already exists" in res2.json()["detail"].lower()

        # Same SKU case-insensitive
        payload["sku"] = "sku-tea-dup"
        res3 = client.post("/api/products", json=payload)
        assert res3.status_code == 409


def test_invalid_price_and_stock_rejected(initialized_db):
    with TestClient(create_app()) as client:
        # Negative opening stock
        res1 = client.post("/api/products", json={
            "name": "Negative Stock",
            "sku": "SKU-NEG-1",
            "base_unit": "kg",
            "opening_stock": -500,
        })
        assert res1.status_code == 422

        # Negative purchase price
        res2 = client.post("/api/products", json={
            "name": "Negative Price",
            "sku": "SKU-NEG-2",
            "base_unit": "kg",
            "purchase_price": -100,
        })
        assert res2.status_code == 422

        # Empty name
        res3 = client.post("/api/products", json={
            "name": "   ",
            "sku": "SKU-EMPTY",
            "base_unit": "kg",
        })
        assert res3.status_code == 422


def test_product_listing_pagination_and_search(initialized_db):
    with TestClient(create_app()) as client:
        # Seed 3 products
        client.post("/api/products", json={
            "name": "Basmati Rice Premium",
            "sku": "SKU-RICE-01",
            "category": "Grains",
            "base_unit": "kg",
            "opening_stock": 50000,
            "purchase_price": 9000,
            "selling_price": 12000,
            "low_stock_threshold": 10000,
        })
        client.post("/api/products", json={
            "name": "Wheat Flour Sharbati",
            "sku": "SKU-FLOUR-02",
            "category": "Grains",
            "base_unit": "kg",
            "opening_stock": 2000,
            "purchase_price": 4000,
            "selling_price": 5000,
            "low_stock_threshold": 5000,  # low stock!
        })
        client.post("/api/products", json={
            "name": "Amul Butter",
            "sku": "SKU-DAIRY-03",
            "category": "Dairy",
            "base_unit": "packet",
            "opening_stock": 30000,
            "purchase_price": 4500,
            "selling_price": 5500,
            "low_stock_threshold": 5000,
        })

        # List all
        res = client.get("/api/products")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # Search by query 'rice'
        res_q = client.get("/api/products?query=rice")
        assert res_q.json()["total"] == 1
        assert res_q.json()["items"][0]["sku"] == "SKU-RICE-01"

        # Search by SKU part 'flour'
        res_sku = client.get("/api/products?query=flour")
        assert res_sku.json()["total"] == 1
        assert res_sku.json()["items"][0]["name"] == "Wheat Flour Sharbati"

        # Filter by category
        res_cat = client.get("/api/products?category=Grains")
        assert res_cat.json()["total"] == 2

        # Filter by low_stock_only
        res_low = client.get("/api/products?low_stock_only=true")
        assert res_low.json()["total"] == 1
        assert res_low.json()["items"][0]["sku"] == "SKU-FLOUR-02"

        # Pagination: limit=1, offset=1
        res_page = client.get("/api/products?limit=1&offset=1")
        assert res_page.json()["total"] == 3
        assert len(res_page.json()["items"]) == 1


def test_get_product_detail_and_missing_handling(initialized_db):
    with TestClient(create_app()) as client:
        # Missing product
        res_404 = client.get("/api/products/999999")
        assert res_404.status_code == 404
        assert "not found" in res_404.json()["detail"].lower()

        # Create product
        res_create = client.post("/api/products", json={
            "name": "Chana Dal",
            "sku": "SKU-DAL-01",
            "base_unit": "kg",
            "opening_stock": 10000,
        })
        prod_id = res_create.json()["id"]

        # Add unit conversion
        client.post(f"/api/products/{prod_id}/conversions", json={
            "from_unit": "bag",
            "to_unit": "kg",
            "factor": 25000,
        })

        # Get detail
        res_detail = client.get(f"/api/products/{prod_id}")
        assert res_detail.status_code == 200
        detail = res_detail.json()
        assert detail["id"] == prod_id
        assert detail["name"] == "Chana Dal"
        assert len(detail["conversions"]) == 1
        assert detail["conversions"][0]["from_unit"] == "bag"
        assert detail["conversions"][0]["factor"] == 25000


def test_update_product_success_and_sku_conflict(initialized_db):
    with TestClient(create_app()) as client:
        res1 = client.post("/api/products", json={
            "name": "Item A",
            "sku": "SKU-AAA",
            "base_unit": "piece",
            "opening_stock": 5000,
            "purchase_price": 1000,
            "selling_price": 1500,
        })
        res2 = client.post("/api/products", json={
            "name": "Item B",
            "sku": "SKU-BBB",
            "base_unit": "piece",
            "opening_stock": 2000,
            "purchase_price": 2000,
            "selling_price": 2500,
        })
        id_a = res1.json()["id"]
        id_b = res2.json()["id"]

        # Safe update of Item A
        res_up = client.put(f"/api/products/{id_a}", json={
            "name": "Item A Updated",
            "sku": "SKU-AAA-NEW",
            "category": "Stationery",
            "base_unit": "piece",
            "purchase_price": 1200,
            "selling_price": 1800,
            "low_stock_threshold": 1000,
        })
        assert res_up.status_code == 200
        updated = res_up.json()
        assert updated["name"] == "Item A Updated"
        assert updated["sku"] == "SKU-AAA-NEW"
        assert updated["stock_qty"] == 5000  # stock untouched by PUT
        assert updated["purchase_price"] == 1200

        # Conflict: try to rename Item A's SKU to Item B's SKU
        res_conflict = client.put(f"/api/products/{id_a}", json={
            "name": "Item A Conflict",
            "sku": "SKU-BBB",
            "base_unit": "piece",
            "purchase_price": 1000,
            "selling_price": 1500,
            "low_stock_threshold": 0,
        })
        assert res_conflict.status_code == 409


def test_deactivate_and_reactivate_product(initialized_db):
    with TestClient(create_app()) as client:
        res = client.post("/api/products", json={
            "name": "Seasonal Biscuit",
            "sku": "SKU-BISC-01",
            "base_unit": "packet",
            "opening_stock": 10000,
        })
        prod_id = res.json()["id"]

        # Deactivate
        res_deact = client.patch(f"/api/products/{prod_id}/deactivate")
        assert res_deact.status_code == 200
        assert res_deact.json()["active"] == 0

        # Still retrievable (not deleted!)
        res_get = client.get(f"/api/products/{prod_id}")
        assert res_get.status_code == 200
        assert res_get.json()["active"] == 0

        # Filter by active in list
        res_active = client.get("/api/products?active=true")
        assert all(item["id"] != prod_id for item in res_active.json()["items"])

        # Reactivate
        res_react = client.patch(f"/api/products/{prod_id}/reactivate")
        assert res_react.status_code == 200
        assert res_react.json()["active"] == 1


def test_unit_conversion_crud_and_validation(initialized_db):
    with TestClient(create_app()) as client:
        res = client.post("/api/products", json={
            "name": "Sugar",
            "sku": "SKU-SUGAR-01",
            "base_unit": "kg",
            "opening_stock": 100000,
        })
        prod_id = res.json()["id"]

        # 1. Create valid conversion: 1 sack = 50 kg (50,000 milli-units)
        res_conv = client.post(f"/api/products/{prod_id}/conversions", json={
            "from_unit": "sack",
            "to_unit": "kg",
            "factor": 50000,
        })
        assert res_conv.status_code == 201
        conv_id = res_conv.json()["id"]
        assert res_conv.json()["factor"] == 50000

        # 2. Reject same from_unit and to_unit
        res_same = client.post(f"/api/products/{prod_id}/conversions", json={
            "from_unit": "kg",
            "to_unit": "kg",
            "factor": 1000,
        })
        assert res_same.status_code == 400

        # 3. Reject duplicate conversion
        res_dup = client.post(f"/api/products/{prod_id}/conversions", json={
            "from_unit": "sack",
            "to_unit": "kg",
            "factor": 50000,
        })
        assert res_dup.status_code == 409

        # 4. Reject factor <= 0
        res_neg = client.post(f"/api/products/{prod_id}/conversions", json={
            "from_unit": "box",
            "to_unit": "kg",
            "factor": 0,
        })
        assert res_neg.status_code == 422

        # 5. List conversions
        res_list = client.get(f"/api/products/{prod_id}/conversions")
        assert res_list.status_code == 200
        assert len(res_list.json()) == 1

        # 6. Update conversion: change factor to 45 kg
        res_up = client.put(f"/api/products/{prod_id}/conversions/{conv_id}", json={
            "from_unit": "sack",
            "to_unit": "kg",
            "factor": 45000,
        })
        assert res_up.status_code == 200
        assert res_up.json()["factor"] == 45000

        # 7. Delete conversion
        res_del = client.delete(f"/api/products/{prod_id}/conversions/{conv_id}")
        assert res_del.status_code == 200
        res_list_after = client.get(f"/api/products/{prod_id}/conversions")
        assert len(res_list_after.json()) == 0


def test_rollback_on_failed_product_creation(initialized_db):
    conn = connect(initialized_db)
    before_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    conn.close()

    with TestClient(create_app()) as client:
        # Invalid payload triggering Pydantic validation error
        res = client.post("/api/products", json={
            "name": "",
            "sku": "BAD",
            "base_unit": "kg",
        })
        assert res.status_code == 422

    conn = connect(initialized_db)
    after_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    conn.close()
    assert after_count == before_count


def test_safe_behavior_with_preexisting_data(initialized_db):
    # Pre-populate some historical product in database directly
    conn = connect(initialized_db)
    try:
        conn.execute(
            """
            INSERT INTO products (name, sku, category, stock_qty, base_unit, purchase_price, selling_price, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            ("Pre-existing Dal", "SKU-PRE-1", "Pulses", 15000, "kg", 8000, 10000),
        )
        conn.commit()
    finally:
        conn.close()

    # Verify that the new API reads pre-existing data without corruption
    with TestClient(create_app()) as client:
        res = client.get("/api/products?query=Pre-existing")
        assert res.status_code == 200
        items = res.json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Pre-existing Dal"
        assert items[0]["stock_qty"] == 15000
