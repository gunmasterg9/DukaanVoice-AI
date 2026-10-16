"""Sales and purchase transaction endpoints and inventory ledger integration."""

from __future__ import annotations

import sqlite3
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.schemas.health import ErrorResponse
from app.schemas.transaction import (
    InventoryMovementResponse,
    TransactionCreate,
    TransactionDetailResponse,
    TransactionItemResponse,
    TransactionListResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _calculate_base_quantity(
    conn: sqlite3.Connection,
    product_id: int,
    product_name: str,
    base_unit: str,
    line_unit: str,
    line_quantity_milli: int,
) -> int:
    """Calculate line quantity in product's base unit (in milli-units).

    Enforces explicit conversion rules when line_unit != base_unit.
    """
    clean_line_unit = line_unit.strip().lower()
    clean_base_unit = base_unit.strip().lower()

    if clean_line_unit == clean_base_unit:
        return line_quantity_milli

    # Look up explicit conversion rule
    row = conn.execute(
        """
        SELECT from_unit, to_unit, factor FROM unit_conversions
        WHERE product_id = ? AND (
            (LOWER(from_unit) = ? AND LOWER(to_unit) = ?) OR
            (LOWER(from_unit) = ? AND LOWER(to_unit) = ?)
        )
        """,
        (product_id, clean_line_unit, clean_base_unit, clean_base_unit, clean_line_unit),
    ).fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No explicit unit conversion rule found for product '{product_name}' "
                f"between '{line_unit}' and product base unit '{base_unit}'."
            ),
        )

    factor = int(row["factor"])
    from_u = str(row["from_unit"]).lower()
    to_u = str(row["to_unit"]).lower()

    if from_u == clean_line_unit and to_u == clean_base_unit:
        # e.g. 1 box (from) = 24 pieces (to = base), factor = 24000
        # base_quantity = (line_quantity_milli * factor) // 1000
        converted = (line_quantity_milli * factor) // 1000
    else:
        # e.g. 1 piece (from = base) = 0.0416 box (to), factor
        converted = (line_quantity_milli * 1000) // factor

    if converted <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Calculated base quantity for '{product_name}' must be greater than zero.",
        )

    return converted


def _fetch_transaction_items(
    conn: sqlite3.Connection, transaction_id: int
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT ti.*, p.name AS product_name, p.sku AS product_sku, p.base_unit AS product_base_unit
        FROM transaction_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transaction_id = ?
        ORDER BY ti.id ASC
        """,
        (transaction_id,),
    ).fetchall()

    items = []
    for r in rows:
        base_qty = _calculate_base_quantity(
            conn=conn,
            product_id=r["product_id"],
            product_name=r["product_name"],
            base_unit=r["product_base_unit"],
            line_unit=r["unit"],
            line_quantity_milli=int(r["quantity"]),
        )
        items.append({
            "id": int(r["id"]),
            "transaction_id": int(r["transaction_id"]),
            "product_id": int(r["product_id"]),
            "product_name": str(r["product_name"]),
            "product_sku": str(r["product_sku"]) if r["product_sku"] is not None else None,
            "quantity": int(r["quantity"]),
            "unit": str(r["unit"]),
            "unit_price": int(r["unit_price"]),
            "line_total": int(r["line_total"]),
            "base_unit": str(r["product_base_unit"]),
            "base_quantity": base_qty,
        })
    return items


def _fetch_transaction_movements(
    conn: sqlite3.Connection, transaction_id: int
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT im.*, p.name AS product_name
        FROM inventory_movements im
        LEFT JOIN products p ON im.product_id = p.id
        WHERE im.transaction_id = ?
        ORDER BY im.id ASC
        """,
        (transaction_id,),
    ).fetchall()

    movements = []
    for r in rows:
        movements.append({
            "id": int(r["id"]),
            "product_id": int(r["product_id"]),
            "product_name": str(r["product_name"]) if r["product_name"] else None,
            "transaction_id": int(r["transaction_id"]) if r["transaction_id"] else None,
            "movement_type": str(r["movement_type"]),
            "quantity_change": int(r["quantity_change"]),
            "stock_before": int(r["stock_before"]),
            "stock_after": int(r["stock_after"]),
            "created_at": str(r["created_at"]),
        })
    return movements


def _row_to_transaction_dict(
    conn: sqlite3.Connection, row: sqlite3.Row, include_movements: bool = False
) -> dict[str, Any]:
    tx_id = int(row["id"])
    items = _fetch_transaction_items(conn, tx_id)
    total_amount = sum(it["line_total"] for it in items)

    row_keys = row.keys()
    payment_method = str(row["payment_method"]) if "payment_method" in row_keys and row["payment_method"] else "cash"
    customer_id = int(row["customer_id"]) if "customer_id" in row_keys and row["customer_id"] is not None else None
    customer_name = None
    if customer_id is not None:
        c_row = conn.execute("SELECT name FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if c_row:
            customer_name = str(c_row["name"])

    data: dict[str, Any] = {
        "id": tx_id,
        "type": str(row["type"]),
        "status": str(row["status"]),
        "payment_method": payment_method,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "idempotency_key": str(row["idempotency_key"]) if row["idempotency_key"] else None,
        "original_instruction": str(row["original_instruction"]),
        "created_at": str(row["created_at"]),
        "confirmed_at": str(row["confirmed_at"]) if row["confirmed_at"] else None,
        "total_amount": total_amount,
        "total_items": len(items),
        "items": items,
    }

    if include_movements:
        data["movements"] = _fetch_transaction_movements(conn, tx_id)

    return data


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_transaction_draft(payload: TransactionCreate) -> TransactionResponse:
    """Create a draft transaction. Drafts do not modify inventory."""
    with connection() as conn:
        # Check idempotency
        if payload.idempotency_key:
            existing = conn.execute(
                "SELECT * FROM transactions WHERE idempotency_key = ?",
                (payload.idempotency_key,),
            ).fetchone()
            if existing:
                if existing["type"] != payload.type:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"Idempotency key '{payload.idempotency_key}' collision with different "
                            f"transaction type '{existing['type']}'."
                        ),
                    )
                # Return the existing transaction idempotently
                return TransactionResponse(**_row_to_transaction_dict(conn, existing))

        # Validate products and units before inserting
        validated_items = []
        for item in payload.items:
            product = conn.execute(
                "SELECT * FROM products WHERE id = ?",
                (item.product_id,),
            ).fetchone()
            if not product:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product ID {item.product_id} not found.",
                )
            if not product["active"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product '{product['name']}' is inactive and cannot be included in transactions.",
                )

            # Ensure valid unit conversion exists
            _calculate_base_quantity(
                conn=conn,
                product_id=product["id"],
                product_name=product["name"],
                base_unit=product["base_unit"],
                line_unit=item.unit,
                line_quantity_milli=item.quantity,
            )

            # Authoritative backend line total in paise
            line_total = (item.quantity * item.unit_price) // 1000
            validated_items.append((
                item.product_id,
                item.quantity,
                item.unit,
                item.unit_price,
                line_total,
            ))

        # Validate customer if credit transaction
        if payload.payment_method == "credit":
            if not payload.customer_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A customer must be specified for credit (Udhaar) transactions.",
                )

        if payload.customer_id:
            cust = conn.execute(
                "SELECT * FROM customers WHERE id = ?",
                (payload.customer_id,),
            ).fetchone()
            if not cust:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Customer ID {payload.customer_id} not found.",
                )
            if not cust["active"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Customer '{cust['name']}' is inactive.",
                )

        # Insert draft transaction
        cursor = conn.execute(
            """
            INSERT INTO transactions (
                type, status, idempotency_key, original_instruction,
                payment_method, customer_id, created_at
            )
            VALUES (?, 'draft', ?, ?, ?, ?, datetime('now'))
            """,
            (
                payload.type,
                payload.idempotency_key,
                payload.original_instruction,
                payload.payment_method,
                payload.customer_id,
            ),
        )
        tx_id = cursor.lastrowid

        for p_id, qty, unit, price, total in validated_items:
            conn.execute(
                """
                INSERT INTO transaction_items (transaction_id, product_id, quantity, unit, unit_price, line_total)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (tx_id, p_id, qty, unit, price, total),
            )

        tx_row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
        assert tx_row is not None
        return TransactionResponse(**_row_to_transaction_dict(conn, tx_row))


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    type: Optional[str] = Query(None, description="Filter by type: sale or purchase"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: draft, confirmed, reversed"),
    product_id: Optional[int] = Query(None, description="Filter transactions involving a product"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method: cash, upi, credit"),
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> TransactionListResponse:
    """List transactions with filtering and pagination."""
    where_clauses: list[str] = []
    params: list[Any] = []

    if payment_method and payment_method.strip():
        where_clauses.append("t.payment_method = ?")
        params.append(payment_method.strip().lower())

    if customer_id is not None:
        where_clauses.append("t.customer_id = ?")
        params.append(customer_id)

    if type and type.strip():
        where_clauses.append("t.type = ?")
        params.append(type.strip().lower())

    if status_filter and status_filter.strip():
        where_clauses.append("t.status = ?")
        params.append(status_filter.strip().lower())

    if start_date and start_date.strip():
        where_clauses.append("t.created_at >= ?")
        params.append(start_date.strip())

    if end_date and end_date.strip():
        where_clauses.append("t.created_at <= ?")
        params.append(f"{end_date.strip()} 23:59:59")

    if product_id is not None:
        where_clauses.append(
            "EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = t.id AND ti.product_id = ?)"
        )
        params.append(product_id)

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        count_query = f"SELECT COUNT(*) FROM transactions t{where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]

        data_query = (
            f"SELECT t.* FROM transactions t{where_sql} "
            f"ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?"
        )
        data_params = params + [limit, offset]
        rows = conn.execute(data_query, data_params).fetchall()
        items = [TransactionResponse(**_row_to_transaction_dict(conn, r)) for r in rows]

        # Calculate revenue and expense totals across confirmed transactions
        rev_row = conn.execute(
            """
            SELECT COALESCE(SUM(ti.line_total), 0)
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            WHERE t.type = 'sale' AND t.status = 'confirmed'
            """
        ).fetchone()
        total_revenue = int(rev_row[0]) if rev_row else 0

        exp_row = conn.execute(
            """
            SELECT COALESCE(SUM(ti.line_total), 0)
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            WHERE t.type = 'purchase' AND t.status = 'confirmed'
            """
        ).fetchone()
        total_expense = int(exp_row[0]) if exp_row else 0

        return TransactionListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
            total_revenue=total_revenue,
            total_expense=total_expense,
        )


@router.get(
    "/{transaction_id}",
    response_model=TransactionDetailResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_transaction(transaction_id: int) -> TransactionDetailResponse:
    """Get full transaction details including line items and inventory movements."""
    with connection(create=False) as conn:
        row = conn.execute(
            "SELECT * FROM transactions WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction {transaction_id} not found.",
            )
        return TransactionDetailResponse(
            **_row_to_transaction_dict(conn, row, include_movements=True)
        )


@router.patch(
    "/{transaction_id}/confirm",
    response_model=TransactionDetailResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def confirm_transaction(transaction_id: int) -> TransactionDetailResponse:
    """Confirm a draft transaction and post atomic inventory movements.

    Idempotent: if already confirmed, returns current state without re-posting.
    """
    with connection() as conn:
        tx = conn.execute(
            "SELECT * FROM transactions WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction {transaction_id} not found.",
            )

        # Idempotency check: already confirmed
        if tx["status"] == "confirmed":
            return TransactionDetailResponse(
                **_row_to_transaction_dict(conn, tx, include_movements=True)
            )

        if tx["status"] == "reversed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot confirm a reversed transaction.",
            )

        if tx["status"] != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot confirm transaction with status '{tx['status']}'.",
            )

        tx_type = tx["type"]
        items = conn.execute(
            """
            SELECT ti.*, p.name AS product_name, p.base_unit, p.stock_qty, p.active
            FROM transaction_items ti
            JOIN products p ON ti.product_id = p.id
            WHERE ti.transaction_id = ?
            """,
            (transaction_id,),
        ).fetchall()

        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaction has no line items.",
            )

        # Revalidate products and calculate all stock changes before committing
        updates = []
        for it in items:
            p_id = it["product_id"]
            p_name = it["product_name"]
            base_unit = it["base_unit"]
            current_stock = int(it["stock_qty"])

            if not it["active"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot confirm transaction: product '{p_name}' is inactive.",
                )

            base_qty = _calculate_base_quantity(
                conn=conn,
                product_id=p_id,
                product_name=p_name,
                base_unit=base_unit,
                line_unit=it["unit"],
                line_quantity_milli=int(it["quantity"]),
            )

            if tx_type == "sale":
                if current_stock < base_qty:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Insufficient stock for product '{p_name}'. "
                            f"Available: {current_stock / 1000} {base_unit}, "
                            f"Required: {base_qty / 1000} {base_unit}."
                        ),
                    )
                new_stock = current_stock - base_qty
                quantity_change = -base_qty
            else:  # purchase
                new_stock = current_stock + base_qty
                quantity_change = base_qty

            updates.append({
                "product_id": p_id,
                "current_stock": current_stock,
                "new_stock": new_stock,
                "quantity_change": quantity_change,
            })

        # Apply stock updates and record movements
        for u in updates:
            conn.execute(
                "UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?",
                (u["new_stock"], u["product_id"]),
            )
            conn.execute(
                """
                INSERT INTO inventory_movements (
                    product_id, transaction_id, movement_type,
                    quantity_change, stock_before, stock_after, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    u["product_id"],
                    transaction_id,
                    tx_type,
                    u["quantity_change"],
                    u["current_stock"],
                    u["new_stock"],
                ),
            )

        # Mark transaction as confirmed
        conn.execute(
            """
            UPDATE transactions
            SET status = 'confirmed', confirmed_at = datetime('now')
            WHERE id = ?
            """,
            (transaction_id,),
        )

        # If credit sale, record audit entry in customer_ledger
        row_keys = tx.keys()
        pay_method = str(tx["payment_method"]) if "payment_method" in row_keys and tx["payment_method"] else "cash"
        cust_id = int(tx["customer_id"]) if "customer_id" in row_keys and tx["customer_id"] is not None else None

        if tx_type == "sale" and pay_method == "credit" and cust_id is not None:
            tx_total = sum(int(it["line_total"]) for it in items)
            last_ledger = conn.execute(
                "SELECT balance_after FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1",
                (cust_id,),
            ).fetchone()
            prev_balance = int(last_ledger["balance_after"]) if last_ledger else 0
            new_balance = prev_balance + tx_total

            conn.execute(
                """
                INSERT INTO customer_ledger (
                    customer_id, transaction_id, entry_type, amount, balance_after, notes, created_at
                )
                VALUES (?, ?, 'credit_sale', ?, ?, ?, datetime('now'))
                """,
                (
                    cust_id,
                    transaction_id,
                    tx_total,
                    new_balance,
                    f"Credit sale #{transaction_id}",
                ),
            )

        updated_tx = conn.execute(
            "SELECT * FROM transactions WHERE id = ?", (transaction_id,)
        ).fetchone()
        assert updated_tx is not None
        return TransactionDetailResponse(
            **_row_to_transaction_dict(conn, updated_tx, include_movements=True)
        )


@router.post(
    "/{transaction_id}/reverse",
    response_model=TransactionDetailResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
@router.patch(
    "/{transaction_id}/reverse",
    response_model=TransactionDetailResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def reverse_transaction(transaction_id: int) -> TransactionDetailResponse:
    """Reverse a confirmed transaction by posting compensating inventory movements."""
    with connection() as conn:
        tx = conn.execute(
            "SELECT * FROM transactions WHERE id = ?",
            (transaction_id,),
        ).fetchone()
        if not tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction {transaction_id} not found.",
            )

        if tx["status"] == "reversed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaction is already reversed. Duplicate reversal is rejected.",
            )

        if tx["status"] == "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reverse an unconfirmed draft. Only confirmed transactions can be reversed.",
            )

        tx_type = tx["type"]
        items = conn.execute(
            """
            SELECT ti.*, p.name AS product_name, p.base_unit, p.stock_qty
            FROM transaction_items ti
            JOIN products p ON ti.product_id = p.id
            WHERE ti.transaction_id = ?
            """,
            (transaction_id,),
        ).fetchall()

        updates = []
        for it in items:
            p_id = it["product_id"]
            p_name = it["product_name"]
            base_unit = it["base_unit"]
            current_stock = int(it["stock_qty"])

            base_qty = _calculate_base_quantity(
                conn=conn,
                product_id=p_id,
                product_name=p_name,
                base_unit=base_unit,
                line_unit=it["unit"],
                line_quantity_milli=int(it["quantity"]),
            )

            if tx_type == "sale":
                # Reversing a sale returns items to stock
                new_stock = current_stock + base_qty
                quantity_change = base_qty
            else:  # purchase
                # Reversing a purchase removes items from stock
                if current_stock < base_qty:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Cannot reverse purchase for product '{p_name}': insufficient stock available. "
                            f"Current stock is {current_stock / 1000} {base_unit}, "
                            f"Required to reverse is {base_qty / 1000} {base_unit}."
                        ),
                    )
                new_stock = current_stock - base_qty
                quantity_change = -base_qty

            updates.append({
                "product_id": p_id,
                "current_stock": current_stock,
                "new_stock": new_stock,
                "quantity_change": quantity_change,
            })

        # Apply stock updates and record compensating movements
        for u in updates:
            conn.execute(
                "UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?",
                (u["new_stock"], u["product_id"]),
            )
            conn.execute(
                """
                INSERT INTO inventory_movements (
                    product_id, transaction_id, movement_type,
                    quantity_change, stock_before, stock_after, created_at
                )
                VALUES (?, ?, 'reversal', ?, ?, ?, datetime('now'))
                """,
                (
                    u["product_id"],
                    transaction_id,
                    u["quantity_change"],
                    u["current_stock"],
                    u["new_stock"],
                ),
            )

        # Mark transaction as reversed
        conn.execute(
            "UPDATE transactions SET status = 'reversed' WHERE id = ?",
            (transaction_id,),
        )

        # If reversed transaction was a credit sale, record compensating ledger adjustment
        row_keys = tx.keys()
        pay_method = str(tx["payment_method"]) if "payment_method" in row_keys and tx["payment_method"] else "cash"
        cust_id = int(tx["customer_id"]) if "customer_id" in row_keys and tx["customer_id"] is not None else None

        if tx_type == "sale" and pay_method == "credit" and cust_id is not None:
            tx_items = conn.execute(
                "SELECT line_total FROM transaction_items WHERE transaction_id = ?",
                (transaction_id,),
            ).fetchall()
            tx_total = sum(int(it["line_total"]) for it in tx_items)

            last_ledger = conn.execute(
                "SELECT balance_after FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1",
                (cust_id,),
            ).fetchone()
            prev_balance = int(last_ledger["balance_after"]) if last_ledger else 0
            new_balance = prev_balance - tx_total

            conn.execute(
                """
                INSERT INTO customer_ledger (
                    customer_id, transaction_id, entry_type, amount, balance_after, notes, created_at
                )
                VALUES (?, ?, 'adjustment', ?, ?, ?, datetime('now'))
                """,
                (
                    cust_id,
                    transaction_id,
                    tx_total,
                    new_balance,
                    f"Reversal of credit sale #{transaction_id}",
                ),
            )

        reversed_tx = conn.execute(
            "SELECT * FROM transactions WHERE id = ?", (transaction_id,)
        ).fetchone()
        assert reversed_tx is not None
        return TransactionDetailResponse(
            **_row_to_transaction_dict(conn, reversed_tx, include_movements=True)
        )
