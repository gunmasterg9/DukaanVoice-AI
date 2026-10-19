"""Deterministic Retail MCP Tools for DukaanVoice AI.

Exposes:
1. get_inventory: Product catalog search and real-time stock balances.
2. record_sale: Two-step sale proposal and confirmation adhering to transactional invariants.
3. record_purchase: Incoming stock receipt with atomic inventory movements.
4. get_daily_report: Deterministic business activity summaries.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from fastapi import HTTPException

from app.database import connection
from app.routers.reports import get_daily_sales_report
from app.routers.transactions import (
    _calculate_base_quantity,
    confirm_transaction,
    create_transaction_draft,
)
from app.schemas.transaction import TransactionCreate, TransactionItemCreate


VERNACULAR_ALIASES: dict[str, list[str]] = {
    "biscuit": ["parle", "biscuit", "marie", "cookie"],
    "biscuits": ["parle", "biscuit", "marie", "cookie"],
    "बिस्कुट": ["parle", "biscuit", "marie", "cookie"],
    "બિસ્કિટ": ["parle", "biscuit", "marie", "cookie"],
    "soap": ["soap", "lifebuoy", "lux"],
    "soaps": ["soap", "lifebuoy", "lux"],
    "साबुन": ["soap", "lifebuoy", "lux"],
    "સાબુ": ["soap", "lifebuoy", "lux"],
    "tea": ["tea", "chai", "ચા", "चाय"],
    "chai": ["tea", "chai", "ચા", "चाय"],
    "चाय": ["tea", "chai", "ચા", "चाय"],
    "ચા": ["tea", "chai", "ચા", "चाय"],
}


def resolve_product(
    conn, product_name_or_sku: str
) -> dict[str, Any]:
    """Find a product unambiguously by ID, SKU, or name."""
    clean = str(product_name_or_sku).strip()
    if not clean:
        raise ValueError("Product identifier or name cannot be empty.")

    # 1. Check if it's a numeric product ID
    if clean.isdigit():
        p_id = int(clean)
        row = conn.execute(
            "SELECT * FROM products WHERE id = ?", (p_id,)
        ).fetchone()
        if row:
            return dict(row)

    # 2. Check exact SKU match (case-insensitive)
    row = conn.execute(
        "SELECT * FROM products WHERE sku IS NOT NULL AND LOWER(sku) = LOWER(?)",
        (clean,),
    ).fetchone()
    if row:
        return dict(row)

    # 3. Check exact name match (case-insensitive)
    row = conn.execute(
        "SELECT * FROM products WHERE LOWER(name) = LOWER(?)",
        (clean,),
    ).fetchone()
    if row:
        return dict(row)

    # 4. Check substring match against name, sku, or category
    term = f"%{clean.lower()}%"
    rows = conn.execute(
        "SELECT * FROM products WHERE LOWER(name) LIKE ? OR (sku IS NOT NULL AND LOWER(sku) LIKE ?) OR (category IS NOT NULL AND LOWER(category) LIKE ?)",
        (term, term, term),
    ).fetchall()

    # 5. Check vernacular synonyms if no rows matched directly
    if not rows and clean.lower() in VERNACULAR_ALIASES:
        for alias in VERNACULAR_ALIASES[clean.lower()]:
            a_term = f"%{alias}%"
            rows = conn.execute(
                "SELECT * FROM products WHERE LOWER(name) LIKE ? OR (sku IS NOT NULL AND LOWER(sku) LIKE ?) OR (category IS NOT NULL AND LOWER(category) LIKE ?)",
                (a_term, a_term, a_term),
            ).fetchall()
            if rows:
                break

    if len(rows) == 1:
        return dict(rows[0])
    elif len(rows) > 1:
        # If all matches have identical name, pick the first
        distinct_names = {r["name"] for r in rows}
        if len(distinct_names) == 1:
            return dict(rows[0])

        # If all matches share a common prefix (e.g. repeated test creations of Parle-G Gold...), pick the first
        import os
        common_pfx = os.path.commonprefix([r["name"] for r in rows]).strip()
        if len(common_pfx) >= 5:
            return dict(rows[0])

        # If one match starts with the search term, pick it
        exact_prefix = [r for r in rows if r["name"].lower().startswith(clean.lower())]
        if len(exact_prefix) == 1:
            return dict(exact_prefix[0])

        candidate_names = [f"#{r['id']} {r['name']} (SKU: {r['sku'] or 'N/A'})" for r in rows[:5]]
        raise ValueError(
            f"Ambiguous product '{clean}'. Found multiple matches: {', '.join(candidate_names)}. Please specify the exact product ID or SKU."
        )
    else:
        raise ValueError(f"Product '{clean}' not found in catalog.")


def get_inventory_tool(
    query: Optional[str] = None,
    low_stock_only: bool = False,
    limit: int = 50,
) -> dict[str, Any]:
    """Find products and current stock.

    Args:
        query: Optional search term matching product name or SKU.
        low_stock_only: If True, filters only items where current stock <= low stock threshold.
        limit: Maximum number of products to return (default: 50).
    """
    where_clauses: list[str] = ["active = 1"]
    params: list[Any] = []

    if query and query.strip():
        q_clean = query.strip().lower()
        if q_clean in VERNACULAR_ALIASES:
            syn_clauses = []
            for alias in VERNACULAR_ALIASES[q_clean]:
                syn_term = f"%{alias}%"
                syn_clauses.append("(LOWER(name) LIKE ? OR (sku IS NOT NULL AND LOWER(sku) LIKE ?) OR (category IS NOT NULL AND LOWER(category) LIKE ?))")
                params.extend([syn_term, syn_term, syn_term])
            where_clauses.append(f"({' OR '.join(syn_clauses)})")
        else:
            term = f"%{q_clean}%"
            where_clauses.append("(LOWER(name) LIKE ? OR (sku IS NOT NULL AND LOWER(sku) LIKE ?) OR (category IS NOT NULL AND LOWER(category) LIKE ?))")
            params.extend([term, term, term])

    if low_stock_only:
        where_clauses.append("stock_qty <= low_stock_threshold")

    where_sql = f" WHERE {' AND '.join(where_clauses)}"

    with connection(create=False) as conn:
        data_query = (
            f"SELECT * FROM products{where_sql} "
            f"ORDER BY name ASC LIMIT ?"
        )
        params.append(max(1, min(limit, 200)))
        rows = conn.execute(data_query, params).fetchall()

        products = []
        for r in rows:
            stock_qty = int(r["stock_qty"])
            threshold = int(r["low_stock_threshold"])
            stock_units = stock_qty / 1000.0
            selling_price_paise = int(r["selling_price"])
            purchase_price_paise = int(r["purchase_price"])

            products.append({
                "product_id": int(r["id"]),
                "name": str(r["name"]),
                "sku": str(r["sku"]) if r["sku"] is not None else None,
                "category": str(r["category"]),
                "stock_quantity": stock_units,
                "stock_milli_units": stock_qty,
                "base_unit": str(r["base_unit"]),
                "selling_price_paise": selling_price_paise,
                "selling_price_rupees": f"₹{selling_price_paise / 100.0:.2f}",
                "purchase_price_paise": purchase_price_paise,
                "purchase_price_rupees": f"₹{purchase_price_paise / 100.0:.2f}",
                "low_stock_threshold_units": threshold / 1000.0,
                "is_low_stock": stock_qty <= threshold,
            })

        return {
            "total_found": len(products),
            "low_stock_filter": low_stock_only,
            "query": query,
            "products": products,
            "summary": f"Found {len(products)} product(s) matching criteria.",
        }


def record_sale_tool(
    product_name_or_sku: str,
    quantity: float,
    unit: Optional[str] = None,
    selling_price: Optional[int] = None,
    idempotency_key: Optional[str] = None,
    confirm: bool = False,
    draft_id: Optional[int] = None,
) -> dict[str, Any]:
    """Record a sale. Follows two-step draft proposal and explicit confirmation.

    Args:
        product_name_or_sku: Product name, numeric ID, or SKU.
        quantity: Quantity to sell (e.g. 5, 2.5).
        unit: Optional unit of sale (e.g. 'piece', 'packet', 'kg'). Defaults to product base_unit.
        selling_price: Optional unit selling price in paise (defaults to catalog price).
        idempotency_key: Optional key to prevent duplicate operations.
        confirm: If False (default), creates a draft proposal with stock preview without mutating inventory.
                 If True, commits the transaction atomically.
        draft_id: If confirming an existing draft proposal, pass its draft_id.
    """
    if quantity <= 0:
        raise ValueError("Sale quantity must be greater than zero.")

    # 1. If confirming an existing draft directly by draft_id:
    if confirm and draft_id is not None:
        try:
            confirmed_tx = confirm_transaction(draft_id)
        except HTTPException as exc:
            raise ValueError(f"Confirmation failed: {exc.detail}") from exc

        # Read updated product stock
        items = confirmed_tx.items
        first_item = items[0] if items else None
        p_name = first_item.product_name if first_item else "Product"
        unit_str = first_item.unit if first_item else ""
        qty_sold = (first_item.quantity / 1000.0) if first_item else quantity

        with connection(create=False) as conn:
            p_row = conn.execute(
                "SELECT stock_qty, base_unit FROM products WHERE id = ?",
                (first_item.product_id if first_item else 0,),
            ).fetchone()
            new_stock = (p_row["stock_qty"] / 1000.0) if p_row else 0.0

        return {
            "status": "confirmed",
            "transaction_id": confirmed_tx.id,
            "product_name": p_name,
            "quantity_sold": qty_sold,
            "unit": unit_str,
            "total_amount_paise": confirmed_tx.total_amount,
            "total_amount_rupees": f"₹{confirmed_tx.total_amount / 100.0:.2f}",
            "current_stock": new_stock,
            "message": f"Sale #{confirmed_tx.id} confirmed! Sold {qty_sold} {unit_str} of {p_name}. Current stock is now {new_stock} {p_row['base_unit'] if p_row else ''}.",
        }

    # 2. Resolve product and validate requested quantity
    with connection(create=False) as conn:
        prod = resolve_product(conn, product_name_or_sku)
        if not prod["active"]:
            raise ValueError(f"Product '{prod['name']}' is inactive and cannot be sold.")

        p_id = int(prod["id"])
        p_name = str(prod["name"])
        p_sku = str(prod["sku"]) if prod["sku"] else None
        base_unit = str(prod["base_unit"])
        sale_unit = str(unit).strip().lower() if unit and str(unit).strip() else base_unit
        curr_stock_milli = int(prod["stock_qty"])
        unit_price_paise = int(selling_price) if selling_price is not None else int(prod["selling_price"])

        qty_milli = int(round(quantity * 1000))
        if qty_milli <= 0:
            raise ValueError("Calculated quantity in milli-units must be positive.")

        # Check unit conversion and base quantity required
        try:
            base_qty_required = _calculate_base_quantity(
                conn=conn,
                product_id=p_id,
                product_name=p_name,
                base_unit=base_unit,
                line_unit=sale_unit,
                line_quantity_milli=qty_milli,
            )
        except HTTPException:
            sale_unit = base_unit
            base_qty_required = qty_milli

        if curr_stock_milli < base_qty_required:
            available_units = curr_stock_milli / 1000.0
            required_units = base_qty_required / 1000.0
            raise ValueError(
                f"Insufficient stock for '{p_name}'. Available: {available_units} {base_unit}, Required: {required_units} {base_unit}."
            )

        total_paise = (qty_milli * unit_price_paise) // 1000
        proposed_stock_milli = curr_stock_milli - base_qty_required

    # 3. Create real transaction draft using existing application service
    draft_payload = TransactionCreate(
        type="sale",
        idempotency_key=idempotency_key,
        original_instruction=f"Alexa+ MCP Sale: {quantity} {sale_unit} of {p_name}",
        payment_method="cash",
        items=[
            TransactionItemCreate(
                product_id=p_id,
                quantity=qty_milli,
                unit=sale_unit,
                unit_price=unit_price_paise,
            )
        ],
    )

    try:
        draft_tx = create_transaction_draft(draft_payload)
    except HTTPException as exc:
        raise ValueError(f"Failed to create draft: {exc.detail}") from exc

    # If confirm=False: return PROPOSAL without mutating stock
    if not confirm:
        return {
            "status": "proposal",
            "draft_id": draft_tx.id,
            "product_id": p_id,
            "product_name": p_name,
            "sku": p_sku,
            "quantity": quantity,
            "unit": sale_unit,
            "unit_price_paise": unit_price_paise,
            "unit_price_rupees": f"₹{unit_price_paise / 100.0:.2f}",
            "total_amount_paise": total_paise,
            "total_amount_rupees": f"₹{total_paise / 100.0:.2f}",
            "current_stock": curr_stock_milli / 1000.0,
            "proposed_stock": proposed_stock_milli / 1000.0,
            "base_unit": base_unit,
            "message": (
                f"I found {p_name}. The proposed sale is {quantity} {sale_unit} for ₹{total_paise / 100.0:.2f}. "
                f"Stock will change from {curr_stock_milli / 1000.0} to {proposed_stock_milli / 1000.0} {base_unit}. "
                f"Would you like to record it?"
            ),
        }

    # If confirm=True: commit the draft atomically
    try:
        confirmed_tx = confirm_transaction(draft_tx.id)
    except HTTPException as exc:
        raise ValueError(f"Failed to commit sale: {exc.detail}") from exc

    return {
        "status": "confirmed",
        "transaction_id": confirmed_tx.id,
        "product_id": p_id,
        "product_name": p_name,
        "sku": p_sku,
        "quantity_sold": quantity,
        "unit": sale_unit,
        "total_amount_paise": confirmed_tx.total_amount,
        "total_amount_rupees": f"₹{confirmed_tx.total_amount / 100.0:.2f}",
        "stock_before": curr_stock_milli / 1000.0,
        "stock_after": proposed_stock_milli / 1000.0,
        "base_unit": base_unit,
        "message": (
            f"Sale recorded! Sold {quantity} {sale_unit} of {p_name}. "
            f"The stock has changed from {curr_stock_milli / 1000.0} to {proposed_stock_milli / 1000.0} {base_unit}."
        ),
    }


def record_purchase_tool(
    product_name_or_sku: str,
    quantity: float,
    unit: Optional[str] = None,
    purchase_price: Optional[int] = None,
    idempotency_key: Optional[str] = None,
    confirm: bool = False,
    draft_id: Optional[int] = None,
) -> dict[str, Any]:
    """Record incoming stock purchase.

    Args:
        product_name_or_sku: Product name, ID, or SKU.
        quantity: Received quantity (must be positive).
        unit: Optional unit of purchase. Defaults to base_unit.
        purchase_price: Optional unit purchase price in paise.
        idempotency_key: Optional idempotency key.
        confirm: If False, returns proposed stock addition. If True, atomically commits.
        draft_id: If confirming an existing purchase draft.
    """
    if quantity <= 0:
        raise ValueError("Purchase quantity must be greater than zero.")

    if confirm and draft_id is not None:
        try:
            confirmed_tx = confirm_transaction(draft_id)
        except HTTPException as exc:
            raise ValueError(f"Purchase confirmation failed: {exc.detail}") from exc

        items = confirmed_tx.items
        first_item = items[0] if items else None
        p_name = first_item.product_name if first_item else "Product"
        unit_str = first_item.unit if first_item else ""
        qty_purchased = (first_item.quantity / 1000.0) if first_item else quantity

        with connection(create=False) as conn:
            p_row = conn.execute(
                "SELECT stock_qty, base_unit FROM products WHERE id = ?",
                (first_item.product_id if first_item else 0,),
            ).fetchone()
            new_stock = (p_row["stock_qty"] / 1000.0) if p_row else 0.0

        return {
            "status": "confirmed",
            "transaction_id": confirmed_tx.id,
            "product_name": p_name,
            "quantity_received": qty_purchased,
            "unit": unit_str,
            "total_cost_paise": confirmed_tx.total_amount,
            "total_cost_rupees": f"₹{confirmed_tx.total_amount / 100.0:.2f}",
            "current_stock": new_stock,
            "message": f"Purchase #{confirmed_tx.id} confirmed! Received {qty_purchased} {unit_str} of {p_name}. Current stock is now {new_stock} {p_row['base_unit'] if p_row else ''}.",
        }

    with connection(create=False) as conn:
        prod = resolve_product(conn, product_name_or_sku)
        if not prod["active"]:
            raise ValueError(f"Product '{prod['name']}' is inactive.")

        p_id = int(prod["id"])
        p_name = str(prod["name"])
        p_sku = str(prod["sku"]) if prod["sku"] else None
        base_unit = str(prod["base_unit"])
        purchase_unit = str(unit).strip().lower() if unit and str(unit).strip() else base_unit
        curr_stock_milli = int(prod["stock_qty"])
        unit_cost_paise = int(purchase_price) if purchase_price is not None else int(prod["purchase_price"])

        qty_milli = int(round(quantity * 1000))
        try:
            base_qty_received = _calculate_base_quantity(
                conn=conn,
                product_id=p_id,
                product_name=p_name,
                base_unit=base_unit,
                line_unit=purchase_unit,
                line_quantity_milli=qty_milli,
            )
        except HTTPException:
            purchase_unit = base_unit
            base_qty_received = qty_milli
        total_cost_paise = (qty_milli * unit_cost_paise) // 1000
        proposed_stock_milli = curr_stock_milli + base_qty_received

    draft_payload = TransactionCreate(
        type="purchase",
        idempotency_key=idempotency_key,
        original_instruction=f"Alexa+ MCP Purchase: {quantity} {purchase_unit} of {p_name}",
        payment_method="cash",
        items=[
            TransactionItemCreate(
                product_id=p_id,
                quantity=qty_milli,
                unit=purchase_unit,
                unit_price=unit_cost_paise,
            )
        ],
    )

    try:
        draft_tx = create_transaction_draft(draft_payload)
    except HTTPException as exc:
        raise ValueError(f"Failed to create purchase draft: {exc.detail}") from exc

    if not confirm:
        return {
            "status": "proposal",
            "draft_id": draft_tx.id,
            "product_id": p_id,
            "product_name": p_name,
            "sku": p_sku,
            "quantity": quantity,
            "unit": purchase_unit,
            "unit_cost_paise": unit_cost_paise,
            "unit_cost_rupees": f"₹{unit_cost_paise / 100.0:.2f}",
            "total_cost_paise": total_cost_paise,
            "total_cost_rupees": f"₹{total_cost_paise / 100.0:.2f}",
            "current_stock": curr_stock_milli / 1000.0,
            "proposed_stock": proposed_stock_milli / 1000.0,
            "base_unit": base_unit,
            "message": (
                f"Proposed purchase of {quantity} {purchase_unit} of {p_name}. "
                f"Cost: ₹{total_cost_paise / 100.0:.2f}. "
                f"Stock will increase from {curr_stock_milli / 1000.0} to {proposed_stock_milli / 1000.0} {base_unit}. "
                f"Confirm to record incoming stock."
            ),
        }

    try:
        confirmed_tx = confirm_transaction(draft_tx.id)
    except HTTPException as exc:
        raise ValueError(f"Failed to confirm purchase: {exc.detail}") from exc

    return {
        "status": "confirmed",
        "transaction_id": confirmed_tx.id,
        "product_id": p_id,
        "product_name": p_name,
        "sku": p_sku,
        "quantity_received": quantity,
        "unit": purchase_unit,
        "total_cost_paise": confirmed_tx.total_amount,
        "total_cost_rupees": f"₹{confirmed_tx.total_amount / 100.0:.2f}",
        "stock_before": curr_stock_milli / 1000.0,
        "stock_after": proposed_stock_milli / 1000.0,
        "base_unit": base_unit,
        "message": (
            f"Stock received! Recorded purchase of {quantity} {purchase_unit} of {p_name}. "
            f"Stock increased from {curr_stock_milli / 1000.0} to {proposed_stock_milli / 1000.0} {base_unit}."
        ),
    }


def get_daily_report_tool(
    business_date: Optional[str] = None,
) -> dict[str, Any]:
    """Summarize business activity for a requested business date.

    Args:
        business_date: Date formatted as YYYY-MM-DD. Defaults to today's date.
    """
    target_date = business_date.strip() if business_date and business_date.strip() else datetime.date.today().isoformat()

    try:
        sales_report = get_daily_sales_report(start_date=target_date, end_date=target_date)
    except HTTPException as exc:
        raise ValueError(f"Report query failed: {exc.detail}") from exc

    day_record = next((d for d in sales_report.days if d.date == target_date), None)
    net_revenue_paise = day_record.net_revenue if day_record else 0
    confirmed_count = day_record.confirmed_count if day_record else 0
    reversed_revenue_paise = day_record.reversed_revenue if day_record else 0
    reversed_count = day_record.reversed_count if day_record else 0

    return {
        "business_date": target_date,
        "total_revenue_paise": net_revenue_paise,
        "total_revenue_rupees": f"₹{net_revenue_paise / 100.0:.2f}",
        "confirmed_sales_count": confirmed_count,
        "reversed_sales_count": reversed_count,
        "reversed_revenue_paise": reversed_revenue_paise,
        "reversed_revenue_rupees": f"₹{reversed_revenue_paise / 100.0:.2f}",
        "gross_revenue_paise": net_revenue_paise + reversed_revenue_paise,
        "gross_revenue_rupees": f"₹{(net_revenue_paise + reversed_revenue_paise) / 100.0:.2f}",
        "message": (
            f"Daily report for {target_date}: {confirmed_count} confirmed sale(s) totaling ₹{net_revenue_paise / 100.0:.2f}. "
            + (f"{reversed_count} reversed sale(s) (₹{reversed_revenue_paise / 100.0:.2f})." if reversed_count > 0 else "No reversed sales.")
        ),
    }
