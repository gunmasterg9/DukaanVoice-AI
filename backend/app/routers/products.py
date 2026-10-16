"""Product management and unit conversion endpoints."""

from __future__ import annotations

import sqlite3
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.database import connection
from app.schemas.health import ErrorResponse
from app.schemas.product import (
    ProductCreate,
    ProductDetailResponse,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
    UnitConversionCreate,
    UnitConversionResponse,
    UnitConversionUpdate,
)

router = APIRouter(prefix="/api/products", tags=["products"])


def _row_to_product(row: sqlite3.Row) -> dict[str, Any]:
    stock_qty = int(row["stock_qty"])
    threshold = int(row["low_stock_threshold"])
    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "sku": str(row["sku"]),
        "category": str(row["category"]),
        "stock_qty": stock_qty,
        "base_unit": str(row["base_unit"]),
        "purchase_price": int(row["purchase_price"]),
        "selling_price": int(row["selling_price"]),
        "low_stock_threshold": threshold,
        "active": int(row["active"]),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "is_low_stock": stock_qty <= threshold,
    }


def _row_to_conversion(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "product_id": int(row["product_id"]),
        "from_unit": str(row["from_unit"]),
        "to_unit": str(row["to_unit"]),
        "factor": int(row["factor"]),
    }


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_product(payload: ProductCreate) -> ProductResponse:
    """Create a new product with opening stock and initial inventory movement."""
    with connection() as conn:
        # Check SKU uniqueness (case-insensitive)
        conflict = conn.execute(
            "SELECT id FROM products WHERE LOWER(sku) = LOWER(?)",
            (payload.sku,),
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A product with SKU '{payload.sku}' already exists.",
            )

        try:
            cursor = conn.execute(
                """
                INSERT INTO products (
                    name, sku, category, stock_qty, base_unit,
                    purchase_price, selling_price, low_stock_threshold,
                    active, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
                """,
                (
                    payload.name,
                    payload.sku,
                    payload.category,
                    payload.opening_stock,
                    payload.base_unit,
                    payload.purchase_price,
                    payload.selling_price,
                    payload.low_stock_threshold,
                ),
            )
            product_id = cursor.lastrowid

            # If opening stock > 0, record initial inventory movement
            if payload.opening_stock > 0:
                conn.execute(
                    """
                    INSERT INTO inventory_movements (
                        product_id, transaction_id, movement_type,
                        quantity_change, stock_before, stock_after, created_at
                    )
                    VALUES (?, NULL, 'adjustment', ?, 0, ?, datetime('now'))
                    """,
                    (product_id, payload.opening_stock, payload.opening_stock),
                )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation: {exc}",
            )

        created_row = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        assert created_row is not None
        return ProductResponse(**_row_to_product(created_row))


@router.get("", response_model=ProductListResponse)
def list_products(
    query: Optional[str] = Query(None, description="Search term for name or SKU"),
    category: Optional[str] = Query(None, description="Filter by category"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    low_stock_only: bool = Query(False, description="Filter for products with low stock"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> ProductListResponse:
    """List and search products with pagination."""
    where_clauses: list[str] = []
    params: list[Any] = []

    if query and query.strip():
        term = f"%{query.strip().lower()}%"
        where_clauses.append("(LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)")
        params.extend([term, term])

    if category and category.strip():
        where_clauses.append("category = ?")
        params.append(category.strip())

    if active is not None:
        where_clauses.append("active = ?")
        params.append(1 if active else 0)

    if low_stock_only:
        where_clauses.append("stock_qty <= low_stock_threshold")

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with connection(create=False) as conn:
        count_query = f"SELECT COUNT(*) FROM products{where_sql}"
        total = conn.execute(count_query, params).fetchone()[0]

        data_query = (
            f"SELECT * FROM products{where_sql} "
            f"ORDER BY active DESC, name ASC LIMIT ? OFFSET ?"
        )
        data_params = params + [limit, offset]
        rows = conn.execute(data_query, data_params).fetchall()

        items = [ProductResponse(**_row_to_product(row)) for row in rows]
        return ProductListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )


@router.get(
    "/{product_id}",
    response_model=ProductDetailResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_product(product_id: int) -> ProductDetailResponse:
    """Get single product details with unit conversions."""
    with connection(create=False) as conn:
        row = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        conv_rows = conn.execute(
            "SELECT * FROM unit_conversions WHERE product_id = ? ORDER BY id ASC",
            (product_id,),
        ).fetchall()
        conversions = [_row_to_conversion(cr) for cr in conv_rows]

        data = _row_to_product(row)
        data["conversions"] = conversions
        return ProductDetailResponse(**data)


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_product(product_id: int, payload: ProductUpdate) -> ProductResponse:
    """Edit product details safely. Stock quantity is preserved."""
    with connection() as conn:
        existing = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        # Check SKU conflict with another product
        conflict = conn.execute(
            "SELECT id FROM products WHERE LOWER(sku) = LOWER(?) AND id <> ?",
            (payload.sku, product_id),
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A product with SKU '{payload.sku}' already exists.",
            )

        try:
            conn.execute(
                """
                UPDATE products
                SET name = ?, sku = ?, category = ?, base_unit = ?,
                    purchase_price = ?, selling_price = ?, low_stock_threshold = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    payload.name,
                    payload.sku,
                    payload.category,
                    payload.base_unit,
                    payload.purchase_price,
                    payload.selling_price,
                    payload.low_stock_threshold,
                    product_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation: {exc}",
            )

        updated_row = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        assert updated_row is not None
        return ProductResponse(**_row_to_product(updated_row))


@router.patch(
    "/{product_id}/deactivate",
    response_model=ProductResponse,
    responses={404: {"model": ErrorResponse}},
)
def deactivate_product(product_id: int) -> ProductResponse:
    """Deactivate a product without deleting historical records."""
    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        conn.execute(
            "UPDATE products SET active = 0, updated_at = datetime('now') WHERE id = ?",
            (product_id,),
        )
        updated_row = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        assert updated_row is not None
        return ProductResponse(**_row_to_product(updated_row))


@router.patch(
    "/{product_id}/reactivate",
    response_model=ProductResponse,
    responses={404: {"model": ErrorResponse}},
)
def reactivate_product(product_id: int) -> ProductResponse:
    """Reactivate a previously deactivated product."""
    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        conn.execute(
            "UPDATE products SET active = 1, updated_at = datetime('now') WHERE id = ?",
            (product_id,),
        )
        updated_row = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        assert updated_row is not None
        return ProductResponse(**_row_to_product(updated_row))


# --- Unit Conversions Endpoints ---


@router.get(
    "/{product_id}/conversions",
    response_model=List[UnitConversionResponse],
    responses={404: {"model": ErrorResponse}},
)
def list_conversions(product_id: int) -> List[UnitConversionResponse]:
    """List all explicit unit conversions for a product."""
    with connection(create=False) as conn:
        existing = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        rows = conn.execute(
            "SELECT * FROM unit_conversions WHERE product_id = ? ORDER BY id ASC",
            (product_id,),
        ).fetchall()
        return [UnitConversionResponse(**_row_to_conversion(row)) for row in rows]


@router.post(
    "/{product_id}/conversions",
    response_model=UnitConversionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_conversion(
    product_id: int, payload: UnitConversionCreate
) -> UnitConversionResponse:
    """Create an explicit unit conversion rule for a product."""
    from_unit = payload.from_unit.strip()
    to_unit = payload.to_unit.strip()

    if from_unit.lower() == to_unit.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_unit and to_unit must be different.",
        )

    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        # Check duplicate conversion
        conflict = conn.execute(
            """
            SELECT id FROM unit_conversions
            WHERE product_id = ? AND LOWER(from_unit) = LOWER(?) AND LOWER(to_unit) = LOWER(?)
            """,
            (product_id, from_unit, to_unit),
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Conversion from '{from_unit}' to '{to_unit}' already exists for this product.",
            )

        try:
            cursor = conn.execute(
                """
                INSERT INTO unit_conversions (product_id, from_unit, to_unit, factor)
                VALUES (?, ?, ?, ?)
                """,
                (product_id, from_unit, to_unit, payload.factor),
            )
            conv_id = cursor.lastrowid
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation: {exc}",
            )

        created_row = conn.execute(
            "SELECT * FROM unit_conversions WHERE id = ?",
            (conv_id,),
        ).fetchone()
        assert created_row is not None
        return UnitConversionResponse(**_row_to_conversion(created_row))


@router.put(
    "/{product_id}/conversions/{conversion_id}",
    response_model=UnitConversionResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_conversion(
    product_id: int, conversion_id: int, payload: UnitConversionUpdate
) -> UnitConversionResponse:
    """Edit an existing unit conversion rule."""
    from_unit = payload.from_unit.strip()
    to_unit = payload.to_unit.strip()

    if from_unit.lower() == to_unit.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_unit and to_unit must be different.",
        )

    with connection() as conn:
        existing_p = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing_p:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        existing_c = conn.execute(
            "SELECT id FROM unit_conversions WHERE id = ? AND product_id = ?",
            (conversion_id, product_id),
        ).fetchone()
        if not existing_c:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unit conversion {conversion_id} not found for product {product_id}.",
            )

        conflict = conn.execute(
            """
            SELECT id FROM unit_conversions
            WHERE product_id = ? AND LOWER(from_unit) = LOWER(?) AND LOWER(to_unit) = LOWER(?)
              AND id <> ?
            """,
            (product_id, from_unit, to_unit, conversion_id),
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Conversion from '{from_unit}' to '{to_unit}' already exists for this product.",
            )

        try:
            conn.execute(
                """
                UPDATE unit_conversions
                SET from_unit = ?, to_unit = ?, factor = ?
                WHERE id = ? AND product_id = ?
                """,
                (from_unit, to_unit, payload.factor, conversion_id, product_id),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation: {exc}",
            )

        updated_row = conn.execute(
            "SELECT * FROM unit_conversions WHERE id = ?",
            (conversion_id,),
        ).fetchone()
        assert updated_row is not None
        return UnitConversionResponse(**_row_to_conversion(updated_row))


@router.delete(
    "/{product_id}/conversions/{conversion_id}",
    responses={404: {"model": ErrorResponse}},
)
def delete_conversion(product_id: int, conversion_id: int) -> dict[str, str]:
    """Delete a unit conversion rule."""
    with connection() as conn:
        existing_p = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
        if not existing_p:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found.",
            )

        existing_c = conn.execute(
            "SELECT id FROM unit_conversions WHERE id = ? AND product_id = ?",
            (conversion_id, product_id),
        ).fetchone()
        if not existing_c:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unit conversion {conversion_id} not found for product {product_id}.",
            )

        conn.execute(
            "DELETE FROM unit_conversions WHERE id = ? AND product_id = ?",
            (conversion_id, product_id),
        )
        return {"status": "ok", "message": "Unit conversion deleted."}
