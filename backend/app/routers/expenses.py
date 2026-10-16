"""Expense register endpoints."""

from __future__ import annotations

import sqlite3
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.schemas.health import ErrorResponse
from app.schemas.expense import (
    EXPENSE_CATEGORIES,
    ExpenseCreate,
    ExpenseListResponse,
    ExpenseResponse,
    ExpenseReversalRequest,
    ExpenseUpdate,
)

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _row_to_expense(row: sqlite3.Row) -> dict[str, Any]:
    is_rev = row["status"] == "reversed"
    notes = str(row["notes"] or "")
    reversal_reason = None
    if is_rev and " [REVERSED:" in notes:
        reversal_reason = notes.split(" [REVERSED:", 1)[1].rstrip("]").strip()
    elif is_rev and " [REVERSED]" in notes:
        reversal_reason = "Reversed"

    return {
        "id": int(row["id"]),
        "expense_date": str(row["expense_date"]),
        "category": str(row["category"]),
        "amount": int(row["amount"]),
        "payment_method": str(row["payment_method"]),
        "notes": notes,
        "status": str(row["status"]),
        "reversed_at": str(row["updated_at"]) if is_rev else None,
        "reversal_reason": reversal_reason,
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


@router.get("/categories")
def get_expense_categories() -> list[str]:
    """Get list of standard shop expense categories."""
    return EXPENSE_CATEGORIES


@router.post(
    "",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def create_expense(payload: ExpenseCreate) -> ExpenseResponse:
    """Record a shop expense (e.g. rent, electricity, transport, wages)."""
    exp_date = payload.expense_date.strip() if payload.expense_date and payload.expense_date.strip() else date.today().isoformat()
    with connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO expenses (
                expense_date, category, amount, payment_method, notes,
                status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
            """,
            (
                exp_date,
                payload.category,
                payload.amount,
                payload.payment_method,
                payload.notes,
            ),
        )
        expense_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        assert row is not None
        return ExpenseResponse(**_row_to_expense(row))


@router.get("", response_model=ExpenseListResponse)
def list_expenses(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    from_date: Optional[str] = Query(None, description="Alias for start_date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Alias for end_date (YYYY-MM-DD)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method: cash, upi, bank_transfer"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: active, reversed, all"),
    include_reversed: bool = Query(False, description="Whether to include reversed expenses"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> ExpenseListResponse:
    """List expenses with filtering, pagination, and totals."""
    eff_start = from_date or start_date
    eff_end = to_date or end_date

    where_clauses: list[str] = []
    params: list[Any] = []

    if eff_start and eff_start.strip():
        where_clauses.append("expense_date >= ?")
        params.append(eff_start.strip())

    if eff_end and eff_end.strip():
        where_clauses.append("expense_date <= ?")
        params.append(eff_end.strip())

    if category and category.strip():
        where_clauses.append("category = ?")
        params.append(category.strip().lower())

    if payment_method and payment_method.strip():
        where_clauses.append("payment_method = ?")
        params.append(payment_method.strip().lower())

    if status_filter and status_filter.strip().lower() in ("active", "reversed"):
        where_clauses.append("status = ?")
        params.append(status_filter.strip().lower())
    elif (status_filter and status_filter.strip().lower() == "all") or include_reversed:
        pass  # include both active and reversed
    else:
        where_clauses.append("status = 'active'")

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        count_query = f"SELECT COUNT(*) FROM expenses{where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]

        data_query = (
            f"SELECT * FROM expenses{where_sql} "
            f"ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?"
        )
        rows = conn.execute(data_query, params + [limit, offset]).fetchall()
        items = [ExpenseResponse(**_row_to_expense(r)) for r in rows]

        # Calculate totals across active expenses matching filters
        totals_where = list(where_clauses)
        totals_params = list(params)
        if "status = ?" not in totals_where and not status_filter:
            totals_where.append("status = 'active'")
        tw_sql = f" WHERE {' AND '.join(totals_where)}" if totals_where else ""

        total_row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) FROM expenses{tw_sql}",
            totals_params,
        ).fetchone()
        total_amount = int(total_row[0]) if total_row else 0

        cash_row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) FROM expenses{tw_sql} "
            f"{'AND' if tw_sql else 'WHERE'} payment_method = 'cash'",
            totals_params,
        ).fetchone()
        cash_total = int(cash_row[0]) if cash_row else 0

        upi_row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) FROM expenses{tw_sql} "
            f"{'AND' if tw_sql else 'WHERE'} payment_method = 'upi'",
            totals_params,
        ).fetchone()
        upi_total = int(upi_row[0]) if upi_row else 0

        bank_row = conn.execute(
            f"SELECT COALESCE(SUM(amount), 0) FROM expenses{tw_sql} "
            f"{'AND' if tw_sql else 'WHERE'} payment_method = 'bank_transfer'",
            totals_params,
        ).fetchone()
        bank_total = int(bank_row[0]) if bank_row else 0

        cat_rows = conn.execute(
            f"SELECT category, COALESCE(SUM(amount), 0) FROM expenses{tw_sql} GROUP BY category",
            totals_params,
        ).fetchall()
        category_totals = {str(r[0]): int(r[1]) for r in cat_rows}

        return ExpenseListResponse(
            items=items,
            total=total,
            total_amount=total_amount,
            cash_total=cash_total,
            upi_total=upi_total,
            bank_total=bank_total,
            category_totals=category_totals,
            limit=limit,
            offset=offset,
        )


@router.get(
    "/{expense_id}",
    response_model=ExpenseResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_expense(expense_id: int) -> ExpenseResponse:
    """Get single expense details."""
    with connection(create=False) as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Expense {expense_id} not found.",
            )
        return ExpenseResponse(**_row_to_expense(row))


@router.put(
    "/{expense_id}",
    response_model=ExpenseResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_expense(expense_id: int, payload: ExpenseUpdate) -> ExpenseResponse:
    """Update an active expense with audit timestamp."""
    with connection() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Expense {expense_id} not found.",
            )
        if row["status"] == "reversed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot edit a reversed expense.",
            )

        new_date = payload.expense_date.strip() if payload.expense_date else row["expense_date"]
        new_cat = payload.category.strip().lower() if payload.category else row["category"]
        new_amount = payload.amount if payload.amount is not None else int(row["amount"])
        new_method = payload.payment_method if payload.payment_method else row["payment_method"]
        new_notes = payload.notes.strip() if payload.notes is not None else row["notes"]

        conn.execute(
            """
            UPDATE expenses
            SET expense_date = ?, category = ?, amount = ?, payment_method = ?, notes = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (new_date, new_cat, new_amount, new_method, new_notes, expense_id),
        )
        updated = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        assert updated is not None
        return ExpenseResponse(**_row_to_expense(updated))


@router.post(
    "/{expense_id}/reverse",
    response_model=ExpenseResponse,
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def reverse_expense(
    expense_id: int,
    payload: Optional[ExpenseReversalRequest] = None,
    reason: Optional[str] = Query(None, description="Reason for reversal"),
) -> ExpenseResponse:
    """Reverse an expense with audit log. Preserves record for accounting history."""
    with connection() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Expense {expense_id} not found.",
            )
        if row["status"] == "reversed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expense is already reversed.",
            )

        eff_reason = (payload.reason if payload and payload.reason else reason) or ""
        append_note = f" [REVERSED: {eff_reason.strip()}]" if eff_reason.strip() else " [REVERSED]"
        updated_notes = (row["notes"] or "") + append_note

        conn.execute(
            """
            UPDATE expenses
            SET status = 'reversed', notes = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (updated_notes, expense_id),
        )
        updated = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        assert updated is not None
        return ExpenseResponse(**_row_to_expense(updated))
