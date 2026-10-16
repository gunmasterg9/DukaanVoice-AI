"""Tests for Expense Register: creation, filtering, reversals, and category summaries."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(initialized_db):
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_expense_crud_and_filters(client):
    # 1. Create expenses
    e1 = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-16",
            "amount": 50000,  # Rs. 500.00
            "category": "electricity",
            "payment_method": "cash",
            "notes": "Shop power bill",
        },
    )
    assert e1.status_code == 201
    d1 = e1.json()
    assert d1["id"] > 0
    assert d1["amount"] == 50000
    assert d1["category"] == "electricity"
    assert d1["payment_method"] == "cash"
    assert d1["reversed_at"] is None

    e2 = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-16",
            "amount": 120000,  # Rs. 1200.00
            "category": "transport",
            "payment_method": "upi",
            "notes": "Stock tempo delivery",
        },
    )
    assert e2.status_code == 201

    e3 = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-15",
            "amount": 25000,  # Rs. 250.00
            "category": "packaging",
            "payment_method": "cash",
            "notes": "Polythene & paper bags",
        },
    )
    assert e3.status_code == 201

    # 2. List all active expenses
    res = client.get("/api/expenses")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    assert data["total_amount"] == 195000  # 50000 + 120000 + 25000
    assert "electricity" in data["category_totals"]
    assert data["category_totals"]["electricity"] == 50000

    # 3. Filter by category
    res = client.get("/api/expenses", params={"category": "transport"})
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["amount"] == 120000

    # 4. Filter by payment method
    res = client.get("/api/expenses", params={"payment_method": "cash"})
    assert res.status_code == 200
    assert res.json()["total"] == 2
    assert res.json()["total_amount"] == 75000

    # 5. Filter by date range
    res = client.get("/api/expenses", params={"from_date": "2026-10-16", "to_date": "2026-10-16"})
    assert res.status_code == 200
    assert res.json()["total"] == 2
    assert res.json()["total_amount"] == 170000


def test_expense_reversal(client):
    e = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-16",
            "amount": 35000,
            "category": "maintenance",
            "payment_method": "cash",
            "notes": "Shutter grease",
        },
    ).json()
    eid = e["id"]

    # Reverse expense
    rev_res = client.post(
        f"/api/expenses/{eid}/reverse",
        json={"reason": "Incorrect entry, paid from personal pocket"},
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["reversed_at"] is not None
    assert rev_data["reversal_reason"] == "Incorrect entry, paid from personal pocket"

    # Cannot reverse twice
    rev2 = client.post(
        f"/api/expenses/{eid}/reverse",
        json={"reason": "Trying again"},
    )
    assert rev2.status_code == 400

    # Verify listing excludes reversed expenses from active total by default
    res = client.get("/api/expenses")
    assert res.json()["total"] == 0
    assert res.json()["total_amount"] == 0

    # Verify listing with include_reversed=True
    res_all = client.get("/api/expenses", params={"include_reversed": True})
    assert res_all.json()["total"] == 1


def test_expense_validation(client):
    # Invalid amount <= 0
    res = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-16",
            "amount": 0,
            "category": "rent",
            "payment_method": "cash",
        },
    )
    assert res.status_code == 422

    # Invalid category
    res = client.post(
        "/api/expenses",
        json={
            "expense_date": "2026-10-16",
            "amount": 10000,
            "category": "illegal_category",
            "payment_method": "cash",
        },
    )
    assert res.status_code == 422
