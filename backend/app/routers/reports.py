"""Business reports and inventory reconciliation endpoints."""

from __future__ import annotations

import sqlite3
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.routers.transactions import _calculate_base_quantity
from app.schemas.health import ErrorResponse
from app.schemas.report import (
    DailySalesDay,
    DailySalesReport,
    InventorySummaryItem,
    InventorySummaryReport,
    MovementListItem,
    MovementListResponse,
    ProductSalesItem,
    ProductSalesReport,
    PurchaseReport,
    PurchaseReportDay,
    ReconciliationItem,
    ReconciliationReport,
    ReconciliationSummary,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# A. Daily Sales Report
# ---------------------------------------------------------------------------
@router.get(
    "/sales/daily",
    response_model=DailySalesReport,
    responses={400: {"model": ErrorResponse}},
)
def get_daily_sales_report(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
) -> DailySalesReport:
    """Daily sales aggregation: net confirmed revenue, transaction count, and reversed sales breakdown."""
    where_clauses = ["t.type = 'sale'", "t.status IN ('confirmed', 'reversed')"]
    params: list[Any] = []

    if start_date and start_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) >= ?")
        params.append(start_date.strip())

    if end_date and end_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) <= ?")
        params.append(end_date.strip())

    where_sql = f"WHERE {' AND '.join(where_clauses)}"

    with connection(create=False) as conn:
        # Group sales transactions by date and status
        query = f"""
            SELECT
                COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) AS tx_date,
                t.status,
                t.id AS tx_id,
                COALESCE(SUM(ti.line_total), 0) AS tx_total
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            {where_sql}
            GROUP BY t.id
            ORDER BY tx_date DESC, t.id DESC
        """
        rows = conn.execute(query, params).fetchall()

        # Aggregate by date
        days_map: dict[str, dict[str, int]] = {}
        for r in rows:
            d = str(r["tx_date"])
            tx_status = str(r["status"])
            tx_total = int(r["tx_total"])

            if d not in days_map:
                days_map[d] = {
                    "net_revenue": 0,
                    "confirmed_count": 0,
                    "reversed_revenue": 0,
                    "reversed_count": 0,
                }

            if tx_status == "confirmed":
                days_map[d]["net_revenue"] += tx_total
                days_map[d]["confirmed_count"] += 1
            elif tx_status == "reversed":
                days_map[d]["reversed_revenue"] += tx_total
                days_map[d]["reversed_count"] += 1

        days: list[DailySalesDay] = []
        total_revenue = 0
        total_transactions = 0
        total_reversed_revenue = 0
        total_reversed_count = 0

        for d, vals in days_map.items():
            days.append(
                DailySalesDay(
                    date=d,
                    net_revenue=vals["net_revenue"],
                    confirmed_count=vals["confirmed_count"],
                    reversed_revenue=vals["reversed_revenue"],
                    reversed_count=vals["reversed_count"],
                )
            )
            total_revenue += vals["net_revenue"]
            total_transactions += vals["confirmed_count"]
            total_reversed_revenue += vals["reversed_revenue"]
            total_reversed_count += vals["reversed_count"]

        # Sort days descending by date
        days.sort(key=lambda x: x.date, reverse=True)

        return DailySalesReport(
            start_date=start_date.strip() if start_date else None,
            end_date=end_date.strip() if end_date else None,
            total_revenue=total_revenue,
            total_transactions=total_transactions,
            gross_revenue=total_revenue + total_reversed_revenue,
            reversed_revenue=total_reversed_revenue,
            reversed_count=total_reversed_count,
            days=days,
        )


# ---------------------------------------------------------------------------
# B. Purchase Report
# ---------------------------------------------------------------------------
@router.get(
    "/purchases",
    response_model=PurchaseReport,
    responses={400: {"model": ErrorResponse}},
)
def get_purchase_report(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
) -> PurchaseReport:
    """Purchase aggregation: net confirmed expenditure, transaction count, and reversed purchase breakdown."""
    where_clauses = ["t.type = 'purchase'", "t.status IN ('confirmed', 'reversed')"]
    params: list[Any] = []

    if start_date and start_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) >= ?")
        params.append(start_date.strip())

    if end_date and end_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) <= ?")
        params.append(end_date.strip())

    where_sql = f"WHERE {' AND '.join(where_clauses)}"

    with connection(create=False) as conn:
        query = f"""
            SELECT
                COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) AS tx_date,
                t.status,
                t.id AS tx_id,
                COALESCE(SUM(ti.line_total), 0) AS tx_total
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            {where_sql}
            GROUP BY t.id
            ORDER BY tx_date DESC, t.id DESC
        """
        rows = conn.execute(query, params).fetchall()

        days_map: dict[str, dict[str, int]] = {}
        for r in rows:
            d = str(r["tx_date"])
            tx_status = str(r["status"])
            tx_total = int(r["tx_total"])

            if d not in days_map:
                days_map[d] = {
                    "net_expenditure": 0,
                    "confirmed_count": 0,
                    "reversed_expenditure": 0,
                    "reversed_count": 0,
                }

            if tx_status == "confirmed":
                days_map[d]["net_expenditure"] += tx_total
                days_map[d]["confirmed_count"] += 1
            elif tx_status == "reversed":
                days_map[d]["reversed_expenditure"] += tx_total
                days_map[d]["reversed_count"] += 1

        days: list[PurchaseReportDay] = []
        total_expenditure = 0
        total_transactions = 0
        total_reversed_expenditure = 0
        total_reversed_count = 0

        for d, vals in days_map.items():
            days.append(
                PurchaseReportDay(
                    date=d,
                    net_expenditure=vals["net_expenditure"],
                    confirmed_count=vals["confirmed_count"],
                    reversed_expenditure=vals["reversed_expenditure"],
                    reversed_count=vals["reversed_count"],
                )
            )
            total_expenditure += vals["net_expenditure"]
            total_transactions += vals["confirmed_count"]
            total_reversed_expenditure += vals["reversed_expenditure"]
            total_reversed_count += vals["reversed_count"]

        days.sort(key=lambda x: x.date, reverse=True)

        return PurchaseReport(
            start_date=start_date.strip() if start_date else None,
            end_date=end_date.strip() if end_date else None,
            total_expenditure=total_expenditure,
            total_transactions=total_transactions,
            gross_expenditure=total_expenditure + total_reversed_expenditure,
            reversed_expenditure=total_reversed_expenditure,
            reversed_count=total_reversed_count,
            days=days,
        )


# ---------------------------------------------------------------------------
# C. Product Sales Report
# ---------------------------------------------------------------------------
@router.get(
    "/products",
    response_model=ProductSalesReport,
    responses={400: {"model": ErrorResponse}},
)
def get_product_sales_report(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    category: Optional[str] = Query(None, description="Filter by product category"),
) -> ProductSalesReport:
    """Product-level sales report: quantity sold in base unit, authoritative line totals, and reversal tracking."""
    where_clauses = ["t.type = 'sale'", "t.status IN ('confirmed', 'reversed')"]
    params: list[Any] = []

    if start_date and start_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) >= ?")
        params.append(start_date.strip())

    if end_date and end_date.strip():
        where_clauses.append("COALESCE(substr(t.confirmed_at, 1, 10), substr(t.created_at, 1, 10)) <= ?")
        params.append(end_date.strip())

    if product_id is not None:
        where_clauses.append("p.id = ?")
        params.append(product_id)

    if category and category.strip():
        where_clauses.append("LOWER(p.category) = LOWER(?)")
        params.append(category.strip())

    where_sql = f"WHERE {' AND '.join(where_clauses)}"

    with connection(create=False) as conn:
        query = f"""
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.sku AS product_sku,
                p.category,
                p.base_unit,
                t.id AS tx_id,
                t.status AS tx_status,
                ti.quantity,
                ti.unit,
                ti.line_total
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            JOIN products p ON ti.product_id = p.id
            {where_sql}
            ORDER BY p.name ASC, t.id ASC
        """
        rows = conn.execute(query, params).fetchall()

        products_map: dict[int, dict[str, Any]] = {}

        for r in rows:
            p_id = int(r["product_id"])
            if p_id not in products_map:
                products_map[p_id] = {
                    "product_id": p_id,
                    "product_name": str(r["product_name"]),
                    "product_sku": str(r["product_sku"]) if r["product_sku"] is not None else None,
                    "category": str(r["category"]),
                    "base_unit": str(r["base_unit"]),
                    "quantity_sold": 0,
                    "total_sales_value": 0,
                    "confirmed_tx_ids": set(),
                    "reversed_quantity": 0,
                    "reversed_sales_value": 0,
                }

            # Convert line quantity to product base unit (in milli-units)
            base_qty = _calculate_base_quantity(
                conn=conn,
                product_id=p_id,
                product_name=str(r["product_name"]),
                base_unit=str(r["base_unit"]),
                line_unit=str(r["unit"]),
                line_quantity_milli=int(r["quantity"]),
            )
            line_total = int(r["line_total"])
            status_val = str(r["tx_status"])
            tx_id = int(r["tx_id"])

            if status_val == "confirmed":
                products_map[p_id]["quantity_sold"] += base_qty
                products_map[p_id]["total_sales_value"] += line_total
                products_map[p_id]["confirmed_tx_ids"].add(tx_id)
            elif status_val == "reversed":
                products_map[p_id]["reversed_quantity"] += base_qty
                products_map[p_id]["reversed_sales_value"] += line_total

        items: list[ProductSalesItem] = []
        overall_sales_value = 0

        for p_id, val in products_map.items():
            items.append(
                ProductSalesItem(
                    product_id=val["product_id"],
                    product_name=val["product_name"],
                    product_sku=val["product_sku"],
                    category=val["category"],
                    base_unit=val["base_unit"],
                    quantity_sold=val["quantity_sold"],
                    total_sales_value=val["total_sales_value"],
                    transaction_count=len(val["confirmed_tx_ids"]),
                    reversed_quantity=val["reversed_quantity"],
                    reversed_sales_value=val["reversed_sales_value"],
                )
            )
            overall_sales_value += val["total_sales_value"]

        # Sort products by total_sales_value DESC, quantity_sold DESC
        items.sort(key=lambda x: (x.total_sales_value, x.quantity_sold), reverse=True)

        return ProductSalesReport(
            start_date=start_date.strip() if start_date else None,
            end_date=end_date.strip() if end_date else None,
            items=items,
            total_sales_value=overall_sales_value,
            total_products_sold=sum(1 for i in items if i.quantity_sold > 0),
        )


# ---------------------------------------------------------------------------
# D. Inventory Summary Report
# ---------------------------------------------------------------------------
@router.get(
    "/inventory",
    response_model=InventorySummaryReport,
    responses={400: {"model": ErrorResponse}},
)
def get_inventory_summary_report(
    low_stock_only: bool = Query(False, description="Filter for products at or below threshold"),
    category: Optional[str] = Query(None, description="Filter by product category"),
    query: Optional[str] = Query(None, description="Filter by product name or SKU"),
) -> InventorySummaryReport:
    """Current inventory valuation, stock quantities, configured thresholds, and audit inflow/outflow totals."""
    where_clauses: list[str] = []
    params: list[Any] = []

    if low_stock_only:
        where_clauses.append("p.stock_qty <= p.low_stock_threshold")

    if category and category.strip():
        where_clauses.append("LOWER(p.category) = LOWER(?)")
        params.append(category.strip())

    if query and query.strip():
        term = f"%{query.strip().lower()}%"
        where_clauses.append("(LOWER(p.name) LIKE ? OR (p.sku IS NOT NULL AND LOWER(p.sku) LIKE ?))")
        params.extend([term, term])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        p_query = f"""
            SELECT p.* FROM products p
            {where_sql}
            ORDER BY p.name ASC
        """
        products = conn.execute(p_query, params).fetchall()

        items: list[InventorySummaryItem] = []
        low_stock_count = 0
        total_cost_val = 0
        total_sell_val = 0

        for p in products:
            p_id = int(p["id"])
            stock_qty = int(p["stock_qty"])
            threshold = int(p["low_stock_threshold"])
            is_low = stock_qty <= threshold
            p_price = int(p["purchase_price"])
            s_price = int(p["selling_price"])

            if is_low:
                low_stock_count += 1

            # Cost and selling value: (stock_qty * price) // 1000 in integer paise
            item_cost = (stock_qty * p_price) // 1000
            item_sell = (stock_qty * s_price) // 1000
            total_cost_val += item_cost
            total_sell_val += item_sell

            # Fetch unit conversions
            conversions = [
                {
                    "id": int(c["id"]),
                    "from_unit": str(c["from_unit"]),
                    "to_unit": str(c["to_unit"]),
                    "factor": int(c["factor"]),
                }
                for c in conn.execute(
                    "SELECT * FROM unit_conversions WHERE product_id = ?", (p_id,)
                ).fetchall()
            ]

            # Inflow and outflow totals from audit ledger
            flows = conn.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END), 0) AS inflow,
                    COALESCE(SUM(CASE WHEN quantity_change < 0 THEN -quantity_change ELSE 0 END), 0) AS outflow
                FROM inventory_movements
                WHERE product_id = ?
                """,
                (p_id,),
            ).fetchone()

            inflow = int(flows["inflow"]) if flows else 0
            outflow = int(flows["outflow"]) if flows else 0

            items.append(
                InventorySummaryItem(
                    product_id=p_id,
                    name=str(p["name"]),
                    sku=str(p["sku"]) if p["sku"] is not None else None,
                    category=str(p["category"]),
                    stock_qty=stock_qty,
                    base_unit=str(p["base_unit"]),
                    purchase_price=p_price,
                    selling_price=s_price,
                    low_stock_threshold=threshold,
                    is_low_stock=is_low,
                    active=int(p["active"]),
                    total_inflow=inflow,
                    total_outflow=outflow,
                    conversions=conversions,
                )
            )

        return InventorySummaryReport(
            items=items,
            total_products=len(items),
            low_stock_count=low_stock_count,
            total_inventory_cost_value=total_cost_val,
            total_inventory_selling_value=total_sell_val,
        )


# ---------------------------------------------------------------------------
# E. Reconciliation Report
# ---------------------------------------------------------------------------
@router.get(
    "/reconciliation",
    response_model=ReconciliationReport,
    responses={400: {"model": ErrorResponse}},
)
def get_reconciliation_report(
    product_id: Optional[int] = Query(None, description="Filter reconciliation to a single product"),
) -> ReconciliationReport:
    """Compare product stock against inventory movement ledger, checking mathematical integrity and chain continuity."""
    params: list[Any] = []
    p_where = ""
    if product_id is not None:
        p_where = "WHERE id = ?"
        params.append(product_id)

    with connection(create=False) as conn:
        products = conn.execute(
            f"SELECT id, name, sku, base_unit, stock_qty FROM products {p_where} ORDER BY name ASC",
            params,
        ).fetchall()

        items: list[ReconciliationItem] = []
        reconciled_count = 0
        discrepancy_count = 0
        gap_detected_count = 0
        no_movements_count = 0

        for p in products:
            p_id = int(p["id"])
            p_name = str(p["name"])
            p_sku = str(p["sku"]) if p["sku"] is not None else None
            base_unit = str(p["base_unit"])
            recorded_stock = int(p["stock_qty"])

            # Fetch all movements for this product in chronological order
            movements = conn.execute(
                """
                SELECT id, transaction_id, movement_type, quantity_change, stock_before, stock_after, created_at
                FROM inventory_movements
                WHERE product_id = ?
                ORDER BY id ASC
                """,
                (p_id,),
            ).fetchall()

            issues: list[str] = []
            gap_detected = False
            step_error = False

            if not movements:
                if recorded_stock == 0:
                    status_str = "no_movements"
                    calculated_stock = 0
                    discrepancy = 0
                    no_movements_count += 1
                else:
                    status_str = "discrepancy"
                    calculated_stock = 0
                    discrepancy = recorded_stock
                    issues.append(
                        f"Unrecorded stock: product has {recorded_stock / 1000} {base_unit} in catalog, "
                        f"but zero movement records exist in the audit ledger."
                    )
                    discrepancy_count += 1
            else:
                # Audit chain of movements
                for idx, m in enumerate(movements):
                    m_id = int(m["id"])
                    s_before = int(m["stock_before"])
                    delta = int(m["quantity_change"])
                    s_after = int(m["stock_after"])

                    # Step math check: stock_before + quantity_change == stock_after
                    if s_before + delta != s_after:
                        step_error = True
                        issues.append(
                            f"Movement #{m_id} arithmetic mismatch: stock_before ({s_before / 1000}) + "
                            f"change ({delta / 1000}) != stock_after ({s_after / 1000})."
                        )

                    # Chain continuity check with previous movement
                    if idx > 0:
                        prev_after = int(movements[idx - 1]["stock_after"])
                        prev_id = int(movements[idx - 1]["id"])
                        if s_before != prev_after:
                            gap_detected = True
                            issues.append(
                                f"Continuity gap between movement #{prev_id} (stock_after={prev_after / 1000}) "
                                f"and #{m_id} (stock_before={s_before / 1000}). Difference: {(s_before - prev_after) / 1000} {base_unit}."
                            )

                # Check starting state of the very first movement
                initial_before = int(movements[0]["stock_before"])
                if initial_before != 0:
                    issues.append(
                        f"Initial movement #{movements[0]['id']} started with non-zero stock_before ({initial_before / 1000} {base_unit}) "
                        f"without prior recorded movement history."
                    )

                # Calculate implied stock: initial stock_before + sum of all quantity_changes
                total_delta = sum(int(m["quantity_change"]) for m in movements)
                calculated_stock = initial_before + total_delta
                discrepancy = recorded_stock - calculated_stock

                # Final stock check: does recorded stock match the last movement's stock_after?
                last_after = int(movements[-1]["stock_after"])
                if recorded_stock != last_after:
                    issues.append(
                        f"Current stock mismatch: catalog record has {recorded_stock / 1000} {base_unit}, "
                        f"but movement ledger ends at {last_after / 1000} {base_unit}."
                    )

                if gap_detected:
                    status_str = "gap_detected"
                    gap_detected_count += 1
                elif discrepancy != 0 or step_error or issues:
                    status_str = "discrepancy"
                    discrepancy_count += 1
                else:
                    status_str = "reconciled"
                    reconciled_count += 1

            items.append(
                ReconciliationItem(
                    product_id=p_id,
                    product_name=p_name,
                    product_sku=p_sku,
                    base_unit=base_unit,
                    recorded_stock=recorded_stock,
                    calculated_stock=calculated_stock,
                    discrepancy=discrepancy,
                    movements_count=len(movements),
                    status=status_str,
                    issues=issues,
                )
            )

        summary = ReconciliationSummary(
            total_products_checked=len(items),
            reconciled_count=reconciled_count,
            discrepancy_count=discrepancy_count,
            gap_detected_count=gap_detected_count,
            no_movements_count=no_movements_count,
        )

        return ReconciliationReport(summary=summary, items=items)


# ---------------------------------------------------------------------------
# F. Inventory Movements Ledger
# ---------------------------------------------------------------------------
@router.get(
    "/inventory/movements",
    response_model=MovementListResponse,
    responses={400: {"model": ErrorResponse}},
)
def list_inventory_movements(
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    movement_type: Optional[str] = Query(None, description="Filter by type: sale, purchase, adjustment, reversal"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> MovementListResponse:
    """Paginated inventory movement ledger with product SKU and name."""
    where_clauses: list[str] = []
    params: list[Any] = []

    if product_id is not None:
        where_clauses.append("im.product_id = ?")
        params.append(product_id)

    if movement_type and movement_type.strip():
        where_clauses.append("im.movement_type = ?")
        params.append(movement_type.strip().lower())

    if start_date and start_date.strip():
        where_clauses.append("substr(im.created_at, 1, 10) >= ?")
        params.append(start_date.strip())

    if end_date and end_date.strip():
        where_clauses.append("substr(im.created_at, 1, 10) <= ?")
        params.append(end_date.strip())

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        count_query = f"SELECT COUNT(*) FROM inventory_movements im {where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]

        data_query = f"""
            SELECT
                im.id,
                im.product_id,
                p.name AS product_name,
                p.sku AS product_sku,
                im.transaction_id,
                im.movement_type,
                im.quantity_change,
                im.stock_before,
                im.stock_after,
                im.created_at
            FROM inventory_movements im
            JOIN products p ON im.product_id = p.id
            {where_sql}
            ORDER BY im.created_at DESC, im.id DESC
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(data_query, params + [limit, offset]).fetchall()

        items = [
            MovementListItem(
                id=int(r["id"]),
                product_id=int(r["product_id"]),
                product_name=str(r["product_name"]),
                product_sku=str(r["product_sku"]) if r["product_sku"] is not None else None,
                transaction_id=int(r["transaction_id"]) if r["transaction_id"] else None,
                movement_type=str(r["movement_type"]),
                quantity_change=int(r["quantity_change"]),
                stock_before=int(r["stock_before"]),
                stock_after=int(r["stock_after"]),
                created_at=str(r["created_at"]),
            )
            for r in rows
        ]

        return MovementListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )
