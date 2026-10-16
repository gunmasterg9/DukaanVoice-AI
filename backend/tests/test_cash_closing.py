"""Tests for Daily Cash Closing: preview reconciliation math, cash drawer integrity, and finalization."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(initialized_db):
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _create_and_confirm_sale(client, payment_method: str, price: int, customer_id: int | None = None) -> int:
    # 1. Product
    prod = client.post(
        "/api/products",
        json={"name": f"Test Item {price}", "selling_price": price, "base_unit": "piece", "opening_stock": 50000},
    ).json()

    # 2. Sale Draft
    payload = {
        "type": "sale",
        "payment_method": payment_method,
        "customer_id": customer_id,
        "items": [
            {
                "product_id": prod["id"],
                "quantity": 1000,
                "unit": "piece",
                "unit_price": price,
            }
        ],
    }
    tx = client.post("/api/transactions", json=payload).json()
    # 3. Confirm
    confirmed = client.patch(f"/api/transactions/{tx['id']}/confirm").json()
    return confirmed["id"]


def test_cash_closing_reconciliation_math(client):
    test_date = "2026-10-16"

    # 1. Cash sale of Rs. 300.00 (30000 paise)
    _create_and_confirm_sale(client, "cash", 30000)

    # 2. UPI sale of Rs. 500.00 (50000 paise) -> Must NOT count towards physical cash drawer
    _create_and_confirm_sale(client, "upi", 50000)

    # 3. Credit sale of Rs. 200.00 (20000 paise) -> Must NOT count towards physical cash drawer
    cust = client.post("/api/customers", json={"name": "Prakash Rao", "phone": "9998887776"}).json()
    _create_and_confirm_sale(client, "credit", 20000, customer_id=cust["id"])

    # 4. Cash repayment of Rs. 150.00 (15000 paise) from customer -> Must count towards cash drawer
    client.post(
        f"/api/customers/{cust['id']}/payments",
        json={"amount": 15000, "payment_method": "cash", "notes": "Part payment"},
    )

    # 5. UPI repayment of Rs. 50.00 (5000 paise) from customer -> Must NOT count towards physical cash drawer
    client.post(
        f"/api/customers/{cust['id']}/payments",
        json={"amount": 5000, "payment_method": "upi", "notes": "GPay payment"},
    )

    # 6. Cash expense of Rs. 100.00 (10000 paise) -> Must be deducted from cash drawer
    client.post(
        "/api/expenses",
        json={
            "expense_date": test_date,
            "amount": 10000,
            "category": "transport",
            "payment_method": "cash",
            "notes": "Rickshaw fare",
        },
    )

    # 7. UPI expense of Rs. 250.00 (25000 paise) -> Must NOT be deducted from physical cash drawer
    client.post(
        "/api/expenses",
        json={
            "expense_date": test_date,
            "amount": 25000,
            "category": "electricity",
            "payment_method": "upi",
            "notes": "Online power bill",
        },
    )

    # Now verify preview calculation with opening cash of Rs. 1000.00 (100000 paise):
    # Expected:
    # opening_cash = 100000
    # cash_sales = 30000
    # cash_repayments = 15000
    # cash_expenses = 10000
    # cash_refunds = 0
    # expected_closing_cash = 100000 + 30000 + 15000 - 10000 = 135000 (Rs. 1350.00)
    prev_res = client.get(
        "/api/cash-closing/preview",
        params={"business_date": test_date, "opening_cash": 100000},
    )
    assert prev_res.status_code == 200
    p = prev_res.json()
    assert p["opening_cash"] == 100000
    assert p["cash_sales"] == 30000
    assert p["cash_repayments"] == 15000
    assert p["cash_expenses"] == 10000
    assert p["cash_refunds"] == 0
    assert p["expected_cash"] == 135000

    # 8. Save draft closing with counted cash of Rs. 1340.00 (134000 paise) -> Rs. 10.00 shortage (-1000 paise)
    draft_res = client.post(
        "/api/cash-closing",
        json={
            "business_date": test_date,
            "opening_cash": 100000,
            "counted_cash": 134000,
            "notes": "Shortage of Rs. 10 in small change",
            "finalize": False,
        },
    )
    assert draft_res.status_code == 201
    draft = draft_res.json()
    assert draft["difference"] == -1000
    assert draft["status"] == "draft"
    closing_id = draft["id"]

    # 9. Finalize the closing
    fin_res = client.post(
        f"/api/cash-closing/{closing_id}/finalize",
        json={"notes": "Finalized by night cashier"},
    )
    assert fin_res.status_code == 200
    fin = fin_res.json()
    assert fin["status"] == "finalized"
    assert fin["closed_at"] is not None

    # 10. Once finalized, cannot be modified or re-finalized
    re_fin = client.post(
        f"/api/cash-closing/{closing_id}/finalize",
        json={"notes": "Trying again"},
    )
    assert re_fin.status_code == 400

    # 11. Cannot create duplicate closing for same date
    dup = client.post(
        "/api/cash-closing",
        json={
            "business_date": test_date,
            "opening_cash": 100000,
            "counted_cash": 134000,
            "finalize": True,
        },
    )
    assert dup.status_code == 400
