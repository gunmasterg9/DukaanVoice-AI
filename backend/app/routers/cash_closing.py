"""Daily cash closing and cash drawer reconciliation router."""

from __future__ import annotations

import sqlite3
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.schemas.health import ErrorResponse
from app.schemas.cash_closing import (
    CashClosingCreate,
    CashClosingListResponse,
    CashClosingPreviewResponse,
    CashClosingResponse,
)

router = APIRouter(prefix="/api/cash-closing", tags=["cash_closing"])


def _row_to_closing(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "business_date": str(row["business_date"]),
        "opening_cash": int(row["opening_cash"]),
        "cash_sales": int(row["cash_sales"]),
        "cash_repayments": int(row["cash_repayments"]),
        "cash_expenses": int(row["cash_expenses"]),
        "cash_refunds": int(row["cash_refunds"]),
        "expected_cash": int(row["expected_cash"]),
        "actual_cash": int(row["actual_cash"]),
        "difference": int(row["difference"]),
        "status": str(row["status"]),
        "notes": str(row["notes"]),
        "created_at": str(row["created_at"]),
        "closed_at": str(row["closed_at"]) if row["closed_at"] else None,
    }


def _calculate_daily_cash(
    conn: sqlite3.Connection, business_date: str, override_opening: Optional[int] = None
) -> dict[str, int]:
    # 1. Opening Cash
    if override_opening is not None:
        opening_cash = override_opening
    else:
        prev = conn.execute(
            """
            SELECT actual_cash FROM cash_closings
            WHERE business_date < ? AND status = 'finalized'
            ORDER BY business_date DESC LIMIT 1
            """,
            (business_date,),
        ).fetchone()
        opening_cash = int(prev[0]) if prev else 0

    # 2. Cash sales (confirmed sales with payment_method == 'cash')
    sales_row = conn.execute(
        """
        SELECT COALESCE(SUM(ti.line_total), 0)
        FROM transactions t
        JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE t.type = 'sale'
          AND t.status = 'confirmed'
          AND t.payment_method = 'cash'
          AND date(t.created_at) = ?
        """,
        (business_date,),
    ).fetchone()
    cash_sales = int(sales_row[0]) if sales_row else 0

    # 3. Cash repayments (customer repayments with payment_method == 'cash')
    repay_row = conn.execute(
        """
        SELECT COALESCE(SUM(amount), 0)
        FROM customer_ledger
        WHERE entry_type = 'payment'
          AND (payment_method = 'cash' OR payment_method IS NULL)
          AND date(created_at) = ?
        """,
        (business_date,),
    ).fetchone()
    cash_repayments = int(repay_row[0]) if repay_row else 0

    # 4. Cash expenses (active expenses with payment_method == 'cash')
    exp_row = conn.execute(
        """
        SELECT COALESCE(SUM(amount), 0)
        FROM expenses
        WHERE status = 'active'
          AND payment_method = 'cash'
          AND expense_date = ?
        """,
        (business_date,),
    ).fetchone()
    cash_expenses = int(exp_row[0]) if exp_row else 0

    # 5. Cash refunds / reversals of sales
    refund_row = conn.execute(
        """
        SELECT COALESCE(SUM(ti.line_total), 0)
        FROM transactions t
        JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE t.type = 'sale'
          AND t.status = 'reversed'
          AND t.payment_method = 'cash'
          AND date(t.created_at) = ?
        """,
        (business_date,),
    ).fetchone()
    cash_refunds = int(refund_row[0]) if refund_row else 0

    expected_cash = opening_cash + cash_sales + cash_repayments - cash_expenses - cash_refunds

    return {
        "opening_cash": opening_cash,
        "cash_sales": cash_sales,
        "cash_repayments": cash_repayments,
        "cash_expenses": cash_expenses,
        "cash_refunds": cash_refunds,
        "expected_cash": expected_cash,
    }


@router.get("/preview", response_model=CashClosingPreviewResponse)
def get_cash_closing_preview(
    business_date: Optional[str] = Query(None, description="Date (YYYY-MM-DD) to calculate closing for"),
    opening_cash: Optional[int] = Query(None, ge=0, description="Optional override for opening cash in paise"),
) -> CashClosingPreviewResponse:
    """Calculate live expected cash drawer balance for a business date."""
    target_date = business_date.strip() if business_date and business_date.strip() else date.today().isoformat()
    try:
        date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    with connection(create=False) as conn:
        metrics = _calculate_daily_cash(conn, target_date, override_opening=opening_cash)
        existing = conn.execute(
            "SELECT * FROM cash_closings WHERE business_date = ?", (target_date,)
        ).fetchone()

        existing_resp = CashClosingResponse(**_row_to_closing(existing)) if existing else None
        is_already_closed = existing["status"] == "finalized" if existing else False

        return CashClosingPreviewResponse(
            business_date=target_date,
            opening_cash=metrics["opening_cash"],
            cash_sales=metrics["cash_sales"],
            cash_repayments=metrics["cash_repayments"],
            cash_expenses=metrics["cash_expenses"],
            cash_refunds=metrics["cash_refunds"],
            expected_cash=metrics["expected_cash"],
            is_already_closed=is_already_closed,
            existing_closing=existing_resp,
        )


@router.post(
    "",
    response_model=CashClosingResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def save_cash_closing(payload: CashClosingCreate) -> CashClosingResponse:
    """Save daily cash closing drawer count as draft or finalized."""
    with connection() as conn:
        existing = conn.execute(
            "SELECT * FROM cash_closings WHERE business_date = ?", (payload.business_date,)
        ).fetchone()

        if existing and existing["status"] == "finalized":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cash closing for {payload.business_date} is already finalized and locked.",
            )

        metrics = _calculate_daily_cash(conn, payload.business_date, override_opening=payload.opening_cash)
        opening_cash = metrics["opening_cash"]
        expected_cash = metrics["expected_cash"]
        difference = payload.actual_cash - expected_cash
        status_val = "finalized" if payload.finalize else "draft"
        closed_at = datetime_now = conn.execute("SELECT datetime('now')").fetchone()[0]
        closed_at_val = closed_at if payload.finalize else None

        if existing:
            conn.execute(
                """
                UPDATE cash_closings
                SET opening_cash = ?, cash_sales = ?, cash_repayments = ?, cash_expenses = ?,
                    cash_refunds = ?, expected_cash = ?, actual_cash = ?, difference = ?,
                    status = ?, notes = ?, closed_at = ?
                WHERE id = ?
                """,
                (
                    opening_cash,
                    metrics["cash_sales"],
                    metrics["cash_repayments"],
                    metrics["cash_expenses"],
                    metrics["cash_refunds"],
                    expected_cash,
                    payload.actual_cash,
                    difference,
                    status_val,
                    payload.notes,
                    closed_at_val,
                    existing["id"],
                ),
            )
            closing_id = existing["id"]
        else:
            cursor = conn.execute(
                """
                INSERT INTO cash_closings (
                    business_date, opening_cash, cash_sales, cash_repayments, cash_expenses,
                    cash_refunds, expected_cash, actual_cash, difference, status, notes,
                    created_at, closed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
                """,
                (
                    payload.business_date,
                    opening_cash,
                    metrics["cash_sales"],
                    metrics["cash_repayments"],
                    metrics["cash_expenses"],
                    metrics["cash_refunds"],
                    expected_cash,
                    payload.actual_cash,
                    difference,
                    status_val,
                    payload.notes,
                    closed_at_val,
                ),
            )
            closing_id = cursor.lastrowid

        row = conn.execute("SELECT * FROM cash_closings WHERE id = ?", (closing_id,)).fetchone()
        assert row is not None
        return CashClosingResponse(**_row_to_closing(row))


@router.post(
    "/{identifier}/finalize",
    response_model=CashClosingResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def finalize_cash_closing(identifier: str) -> CashClosingResponse:
    """Finalize and lock a draft cash closing for the specified business date or closing ID."""
    with connection() as conn:
        if identifier.isdigit():
            existing = conn.execute(
                "SELECT * FROM cash_closings WHERE id = ?", (int(identifier),)
            ).fetchone()
        else:
            existing = conn.execute(
                "SELECT * FROM cash_closings WHERE business_date = ?", (identifier,)
            ).fetchone()

        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No cash closing draft found for {identifier}.",
            )

        if existing["status"] == "finalized":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cash closing for {existing['business_date']} is already finalized and locked.",
            )

        b_date = str(existing["business_date"])
        # Re-verify latest figures before locking
        metrics = _calculate_daily_cash(conn, b_date, override_opening=int(existing["opening_cash"]))
        expected_cash = metrics["expected_cash"]
        actual_cash = int(existing["actual_cash"])
        difference = actual_cash - expected_cash

        conn.execute(
            """
            UPDATE cash_closings
            SET cash_sales = ?, cash_repayments = ?, cash_expenses = ?, cash_refunds = ?,
                expected_cash = ?, difference = ?, status = 'finalized', closed_at = datetime('now')
            WHERE id = ?
            """,
            (
                metrics["cash_sales"],
                metrics["cash_repayments"],
                metrics["cash_expenses"],
                metrics["cash_refunds"],
                expected_cash,
                difference,
                existing["id"],
            ),
        )

        updated = conn.execute("SELECT * FROM cash_closings WHERE id = ?", (existing["id"],)).fetchone()
        assert updated is not None
        return CashClosingResponse(**_row_to_closing(updated))


@router.get("", response_model=CashClosingListResponse)
def list_cash_closings(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> CashClosingListResponse:
    """List historical daily cash closings."""
    with connection(create=False) as conn:
        total = conn.execute("SELECT COUNT(*) FROM cash_closings").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM cash_closings ORDER BY business_date DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        items = [CashClosingResponse(**_row_to_closing(r)) for r in rows]
        return CashClosingListResponse(items=items, total=total)


@router.get(
    "/{business_date}",
    response_model=CashClosingResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_cash_closing(business_date: str) -> CashClosingResponse:
    """Get closing record for a specific business date."""
    with connection(create=False) as conn:
        row = conn.execute(
            "SELECT * FROM cash_closings WHERE business_date = ?", (business_date,)
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cash closing record for {business_date} not found.",
            )
        return CashClosingResponse(**_row_to_closing(row))
