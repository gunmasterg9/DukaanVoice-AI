"""Customer management and Udhaar Khata (Customer Credit Ledger) endpoints."""

from __future__ import annotations

import sqlite3
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.schemas.customer import (
    CustomerCreate,
    CustomerDetailResponse,
    CustomerLedgerEntryResponse,
    CustomerListResponse,
    CustomerPaymentCreate,
    CustomerResponse,
    CustomerStatementEntry,
    CustomerStatementResponse,
    CustomerUpdate,
)
from app.schemas.health import ErrorResponse

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _get_customer_current_balance(conn: sqlite3.Connection, customer_id: int) -> int:
    """Fetch the latest balance_after for a customer from the immutable audit ledger."""
    row = conn.execute(
        """
        SELECT balance_after FROM customer_ledger
        WHERE customer_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (customer_id,),
    ).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _row_to_customer(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    c_id = int(row["id"])
    bal = _get_customer_current_balance(conn, c_id)
    return {
        "id": c_id,
        "name": str(row["name"]),
        "phone": str(row["phone"]),
        "address": str(row["address"]),
        "credit_limit": int(row["credit_limit"]),
        "current_balance": bal,
        "active": int(row["active"]),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


def _row_to_ledger_entry(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "customer_id": int(row["customer_id"]),
        "transaction_id": int(row["transaction_id"]) if row["transaction_id"] else None,
        "entry_type": str(row["entry_type"]),
        "amount": int(row["amount"]),
        "balance_after": int(row["balance_after"]),
        "payment_method": str(row["payment_method"]) if row["payment_method"] else None,
        "notes": str(row["notes"]),
        "created_at": str(row["created_at"]),
    }


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def create_customer(payload: CustomerCreate) -> CustomerResponse:
    """Register a new customer for credit / Udhaar tracking."""
    with connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO customers (name, phone, address, credit_limit, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
            """,
            (payload.name, payload.phone, payload.address, payload.credit_limit),
        )
        c_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM customers WHERE id = ?", (c_id,)).fetchone()
        assert row is not None
        return CustomerResponse(**_row_to_customer(conn, row))


@router.get("", response_model=CustomerListResponse)
def list_customers(
    query: Optional[str] = Query(None, description="Search term for name or phone"),
    active: Optional[bool] = Query(True, description="Filter by active status"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> CustomerListResponse:
    """List customers with search, pagination, and total outstanding credit balance."""
    where_clauses: list[str] = []
    params: list[Any] = []

    if query and query.strip():
        term = f"%{query.strip().lower()}%"
        where_clauses.append("(LOWER(name) LIKE ? OR LOWER(phone) LIKE ?)")
        params.extend([term, term])

    if active is not None:
        where_clauses.append("active = ?")
        params.append(1 if active else 0)

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        count_query = f"SELECT COUNT(*) FROM customers{where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]

        data_query = (
            f"SELECT * FROM customers{where_sql} "
            f"ORDER BY name ASC LIMIT ? OFFSET ?"
        )
        rows = conn.execute(data_query, params + [limit, offset]).fetchall()
        items = [CustomerResponse(**_row_to_customer(conn, r)) for r in rows]

        # Calculate total outstanding credit across all active customers
        # Outstanding is when current_balance > 0 (customer owes shop money)
        all_active_rows = conn.execute("SELECT id FROM customers WHERE active = 1").fetchall()
        total_outstanding = 0
        for ar in all_active_rows:
            bal = _get_customer_current_balance(conn, int(ar["id"]))
            if bal > 0:
                total_outstanding += bal

        return CustomerListResponse(
            items=items,
            total=total,
            total_outstanding=total_outstanding,
        )


@router.get(
    "/{customer_id}",
    response_model=CustomerDetailResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_customer_details(customer_id: int) -> CustomerDetailResponse:
    """Get customer details and complete ledger history."""
    with connection(create=False) as conn:
        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found.",
            )

        data = _row_to_customer(conn, row)
        ledger_rows = conn.execute(
            """
            SELECT * FROM customer_ledger
            WHERE customer_id = ?
            ORDER BY id DESC
            """,
            (customer_id,),
        ).fetchall()
        data["ledger"] = [_row_to_ledger_entry(lr) for lr in ledger_rows]
        return CustomerDetailResponse(**data)


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_customer(customer_id: int, payload: CustomerUpdate) -> CustomerResponse:
    """Update customer details."""
    with connection() as conn:
        existing = conn.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found.",
            )

        conn.execute(
            """
            UPDATE customers
            SET name = ?, phone = ?, address = ?, credit_limit = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (payload.name, payload.phone, payload.address, payload.credit_limit, customer_id),
        )

        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        assert row is not None
        return CustomerResponse(**_row_to_customer(conn, row))


@router.post(
    "/{customer_id}/payments",
    response_model=CustomerDetailResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def record_customer_payment(customer_id: int, payload: CustomerPaymentCreate) -> CustomerDetailResponse:
    """Record a payment received from customer (Cash, UPI, etc.), reducing their outstanding Udhaar balance."""
    with connection() as conn:
        customer = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found.",
            )
        if not customer["active"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot record payment for an inactive customer.",
            )

        current_balance = _get_customer_current_balance(conn, customer_id)
        new_balance = current_balance - payload.amount

        conn.execute(
            """
            INSERT INTO customer_ledger (
                customer_id, transaction_id, entry_type,
                amount, balance_after, payment_method, notes, created_at
            )
            VALUES (?, NULL, 'payment', ?, ?, ?, ?, datetime('now'))
            """,
            (customer_id, payload.amount, new_balance, payload.payment_method, payload.notes),
        )

        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        assert row is not None
        data = _row_to_customer(conn, row)
        ledger_rows = conn.execute(
            "SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC",
            (customer_id,),
        ).fetchall()
        data["ledger"] = [_row_to_ledger_entry(lr) for lr in ledger_rows]
        return CustomerDetailResponse(**data)


@router.patch(
    "/{customer_id}/deactivate",
    response_model=CustomerResponse,
    responses={404: {"model": ErrorResponse}},
)
def deactivate_customer(customer_id: int) -> CustomerResponse:
    """Soft-deactivate customer while preserving complete historical ledger records."""
    with connection() as conn:
        existing = conn.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found.",
            )

        conn.execute(
            "UPDATE customers SET active = 0, updated_at = datetime('now') WHERE id = ?",
            (customer_id,),
        )
        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        assert row is not None
        return CustomerResponse(**_row_to_customer(conn, row))


@router.get(
    "/{customer_id}/statement",
    response_model=CustomerStatementResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_customer_statement(
    customer_id: int,
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
) -> CustomerStatementResponse:
    """Generate an auditable, date-filtered balance statement for a customer."""
    with connection() as conn:
        customer = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer {customer_id} not found.",
            )

        # 1. Opening balance before from_date
        opening_balance = 0
        if from_date:
            prior_entry = conn.execute(
                """
                SELECT balance_after FROM customer_ledger
                WHERE customer_id = ? AND created_at < ?
                ORDER BY id DESC LIMIT 1
                """,
                (customer_id, f"{from_date} 00:00:00"),
            ).fetchone()
            if prior_entry and prior_entry[0] is not None:
                opening_balance = int(prior_entry[0])

        # 2. Entries in date range
        query = "SELECT * FROM customer_ledger WHERE customer_id = ?"
        params: list[Any] = [customer_id]
        if from_date:
            query += " AND created_at >= ?"
            params.append(f"{from_date} 00:00:00")
        if to_date:
            query += " AND created_at <= ?"
            params.append(f"{to_date} 23:59:59")
        query += " ORDER BY id ASC"

        rows = conn.execute(query, params).fetchall()

        entries: list[CustomerStatementEntry] = []
        total_debit = 0
        total_credit = 0

        for r in rows:
            entry_type = str(r["entry_type"])
            amt = int(r["amount"])
            bal_after = int(r["balance_after"])
            pm = str(r["payment_method"]) if r["payment_method"] else None
            notes = str(r["notes"]) if r["notes"] else ""

            if entry_type == "credit_sale":
                debit = amt
                credit = 0
                desc = notes or f"Credit Sale #{r['transaction_id']}"
                total_debit += debit
            else:
                debit = 0
                credit = amt
                desc = notes or (f"Payment ({pm or 'Cash'})" if entry_type == "payment" else "Adjustment")
                total_credit += credit

            entries.append(
                CustomerStatementEntry(
                    id=int(r["id"]),
                    date=str(r["created_at"]),
                    entry_type=entry_type,
                    description=desc,
                    debit=debit,
                    credit=credit,
                    balance_after=bal_after,
                    payment_method=pm,
                    notes=notes,
                )
            )

        # 3. Closing balance
        if entries:
            closing_balance = entries[-1].balance_after
        else:
            closing_balance = opening_balance

        # 4. Formatted shareable summary
        def _fmt(p: int) -> str:
            sign = "-" if p < 0 else ""
            ap = abs(p)
            return f"{sign}Rs.{ap // 100}.{ap % 100:02d}"

        date_span = f"{from_date or 'Start'} to {to_date or 'Today'}"
        shareable_text = (
            f"*Khata Statement - DukaanVoice AI*\n"
            f"Customer: {customer['name']}\n"
            f"Phone: {customer['phone'] or 'N/A'}\n"
            f"Period: {date_span}\n"
            f"Opening Balance: {_fmt(opening_balance)}\n"
            f"Total Credit Sales: {_fmt(total_debit)}\n"
            f"Total Payments Received: {_fmt(total_credit)}\n"
            f"---------------------------------\n"
            f"*Total Balance Due: {_fmt(closing_balance)}*\n"
            f"---------------------------------\n"
            f"Thank you for your business!"
        )

        return CustomerStatementResponse(
            customer_id=customer_id,
            customer_name=str(customer["name"]),
            customer_phone=str(customer["phone"] or ""),
            from_date=from_date,
            to_date=to_date,
            opening_balance=opening_balance,
            total_debit=total_debit,
            total_credit=total_credit,
            closing_balance=closing_balance,
            entries=entries,
            shareable_text=shareable_text,
        )

