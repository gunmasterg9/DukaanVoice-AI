"""Tests for customer Udhaar Khata, payments, ledger, and credit transactions."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(initialized_db):
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_customer_crud(client):
    # 1. Create customer
    res = client.post(
        "/api/customers",
        json={"name": "Ramesh Patel", "phone": "9876543210", "address": "Station Road"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["id"] > 0
    assert data["name"] == "Ramesh Patel"
    assert data["phone"] == "9876543210"
    assert data["current_balance"] == 0
    assert data["active"] == 1
    cust_id = data["id"]

    # 2. Get customer
    res = client.get(f"/api/customers/{cust_id}")
    assert res.status_code == 200
    detail = res.json()
    assert detail["name"] == "Ramesh Patel"
    assert detail["current_balance"] == 0
    assert len(detail["ledger"]) == 0

    # 3. Update customer
    res = client.put(f"/api/customers/{cust_id}", json={"name": "Ramesh Bhai Patel", "phone": "9876500000"})
    assert res.status_code == 200
    assert res.json()["name"] == "Ramesh Bhai Patel"
    assert res.json()["phone"] == "9876500000"

    # 4. Search customer
    res = client.get("/api/customers", params={"query": "Ramesh"})
    assert res.status_code == 200
    assert res.json()["total"] == 1

    res = client.get("/api/customers", params={"query": "98765"})
    assert res.status_code == 200
    assert res.json()["total"] == 1


def test_customer_payment_ledger(client):
    # Create customer
    res = client.post("/api/customers", json={"name": "Suresh Shah"})
    cust_id = res.json()["id"]

    # Record a payment
    res = client.post(
        f"/api/customers/{cust_id}/payments",
        json={"amount": 50000, "payment_mode": "cash", "notes": "Advance payment in cash"},
    )
    assert res.status_code == 200
    cust = res.json()
    # Since balance was 0, a payment of 50000 puts balance at -50000 (advance)
    assert cust["current_balance"] == -50000
    assert len(cust["ledger"]) == 1
    assert cust["ledger"][0]["entry_type"] == "payment"
    assert cust["ledger"][0]["amount"] == 50000
    assert cust["ledger"][0]["balance_after"] == -50000


def test_credit_sale_and_reversal_ledger(client):
    # 1. Create product
    p_res = client.post(
        "/api/products",
        json={
            "name": "Tata Salt",
            "selling_price": 2800,  # 28.00 in paise
            "base_unit": "kg",
            "opening_stock": 10000,  # 10 kg
        },
    )
    assert p_res.status_code == 201
    product_id = p_res.json()["id"]

    # 2. Create customer
    c_res = client.post("/api/customers", json={"name": "Dinesh Kumar", "phone": "9998887776"})
    assert c_res.status_code == 201
    cust_id = c_res.json()["id"]

    # 3. Create credit sale draft
    tx_res = client.post(
        "/api/transactions",
        json={
            "type": "sale",
            "payment_method": "credit",
            "customer_id": cust_id,
            "items": [{"product_id": product_id, "quantity": 2000, "unit": "kg", "unit_price": 2800}],
        },
    )
    assert tx_res.status_code == 201
    tx_data = tx_res.json()
    tx_id = tx_data["id"]
    assert tx_data["payment_method"] == "credit"
    assert tx_data["customer_id"] == cust_id
    assert tx_data["customer_name"] == "Dinesh Kumar"
    assert tx_data["total_amount"] == 5600  # 2 * 2800 = 5600 paise (56.00)

    # Balance should still be 0 while in draft
    c_detail = client.get(f"/api/customers/{cust_id}").json()
    assert c_detail["current_balance"] == 0

    # 4. Confirm transaction -> should update stock and debit customer ledger
    conf_res = client.patch(f"/api/transactions/{tx_id}/confirm")
    assert conf_res.status_code == 200

    c_detail = client.get(f"/api/customers/{cust_id}").json()
    assert c_detail["current_balance"] == 5600  # Customer owes 56.00
    assert len(c_detail["ledger"]) == 1
    assert c_detail["ledger"][0]["entry_type"] == "credit_sale"
    assert c_detail["ledger"][0]["amount"] == 5600
    assert c_detail["ledger"][0]["balance_after"] == 5600

    # 5. Customer makes partial payment of Rs 30 (3000 paise) via UPI
    pay_res = client.post(
        f"/api/customers/{cust_id}/payments",
        json={"amount": 3000, "payment_mode": "upi", "notes": "Google Pay transfer"},
    )
    assert pay_res.status_code == 200
    c_detail = client.get(f"/api/customers/{cust_id}").json()
    assert c_detail["current_balance"] == 2600  # 5600 - 3000 = 2600 paise
    assert len(c_detail["ledger"]) == 2

    # 6. Reversing the credit sale -> should compensate ledger balance
    rev_res = client.patch(f"/api/transactions/{tx_id}/reverse")
    assert rev_res.status_code == 200

    c_detail = client.get(f"/api/customers/{cust_id}").json()
    # Initial balance 5600, then payment 3000 -> 2600. Reversal removes 5600 -> 2600 - 5600 = -3000 (advance)
    assert c_detail["current_balance"] == -3000
    assert len(c_detail["ledger"]) == 3
    assert c_detail["ledger"][0]["entry_type"] == "adjustment"
    assert c_detail["ledger"][0]["amount"] == 5600


def test_credit_sale_requires_customer(client):
    p_res = client.post("/api/products", json={"name": "Soap", "selling_price": 4000})
    p_id = p_res.json()["id"]

    res = client.post(
        "/api/transactions",
        json={
            "type": "sale",
            "payment_method": "credit",
            "customer_id": None,
            "items": [{"product_id": p_id, "quantity": 1000, "unit": "piece", "unit_price": 4000}],
        },
    )
    assert res.status_code == 400
    assert "customer must be specified" in res.json()["detail"].lower()


def test_quick_product_entry_optional_sku_and_purchase_price(client):
    # Kirana quick entry: only name, selling_price, opening_stock
    res = client.post(
        "/api/products",
        json={"name": "Chana Dal 1kg", "selling_price": 9500, "opening_stock": 5000},
    )
    assert res.status_code == 201
    prod = res.json()
    assert prod["sku"] is None
    assert prod["purchase_price"] == 0
    assert prod["selling_price"] == 9500
    assert prod["stock_qty"] == 5000
    assert prod["base_unit"] == "piece"


def test_low_stock_reorder_draft(client):
    # Create 2 products: 1 low stock, 1 healthy stock
    p1 = client.post(
        "/api/products",
        json={
            "name": "Basmati Rice 5kg",
            "selling_price": 50000,
            "purchase_price": 42000,
            "opening_stock": 2000,  # 2 units
            "low_stock_threshold": 5000,  # 5 units (low stock!)
        },
    ).json()

    p2 = client.post(
        "/api/products",
        json={
            "name": "Atta 10kg",
            "selling_price": 40000,
            "purchase_price": 35000,
            "opening_stock": 20000,  # 20 units
            "low_stock_threshold": 5000,  # healthy stock
        },
    ).json()

    # Automatic reorder draft
    res = client.post("/api/products/reorder-draft")
    assert res.status_code == 201
    draft = res.json()
    assert draft["type"] == "purchase"
    assert draft["status"] == "draft"
    assert len(draft["items"]) == 1
    item = draft["items"][0]
    # Suggested qty = (thresh * 2) - stock = (5000 * 2) - 2000 = 8000
    assert item["quantity"] == 8000
    assert item["unit_price"] == 42000


def test_customer_statement(client):
    # 1. Create customer
    c = client.post("/api/customers", json={"name": "Vikram Seth", "phone": "9811223344"}).json()
    cid = c["id"]

    # 2. Create product
    p = client.post(
        "/api/products",
        json={"name": "Mustard Oil", "selling_price": 18000, "base_unit": "bottle", "opening_stock": 10000},
    ).json()

    # 3. Credit sale 1: Rs. 180.00
    tx1 = client.post(
        "/api/transactions",
        json={
            "type": "sale",
            "payment_method": "credit",
            "customer_id": cid,
            "items": [{"product_id": p["id"], "quantity": 1000, "unit": "bottle", "unit_price": 18000}],
        },
    ).json()
    client.patch(f"/api/transactions/{tx1['id']}/confirm")

    # 4. Partial payment: Rs. 80.00
    client.post(
        f"/api/customers/{cid}/payments",
        json={"amount": 8000, "payment_method": "cash", "notes": "Token deposit"},
    )

    # 5. Get statement
    res = client.get(f"/api/customers/{cid}/statement")
    assert res.status_code == 200
    stmt = res.json()
    assert stmt["customer_id"] == cid
    assert stmt["customer_name"] == "Vikram Seth"
    assert stmt["opening_balance"] == 0
    assert stmt["total_debit"] == 18000
    assert stmt["total_credit"] == 8000
    assert stmt["closing_balance"] == 10000  # Rs. 100.00 still owed
    assert len(stmt["entries"]) == 2
    assert "Vikram Seth" in stmt["shareable_text"]
    assert "Total Balance Due: Rs.100.00" in stmt["shareable_text"]

