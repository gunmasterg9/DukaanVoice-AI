"""Pydantic schemas for Phase 4 Business Reports and Inventory Reconciliation."""

from __future__ import annotations

from typing import Any, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Daily Sales Report
# ---------------------------------------------------------------------------
class DailySalesDay(BaseModel):
    date: str = Field(..., description="Date (YYYY-MM-DD)")
    net_revenue: int = Field(..., description="Confirmed active sales revenue in integer paise")
    confirmed_count: int = Field(..., description="Count of confirmed active sales transactions")
    reversed_revenue: int = Field(..., description="Reversed sales value in integer paise")
    reversed_count: int = Field(..., description="Count of reversed sales transactions")


class DailySalesReport(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    total_revenue: int = Field(..., description="Net confirmed sales revenue in integer paise")
    total_transactions: int = Field(..., description="Total count of confirmed active sales transactions")
    gross_revenue: int = Field(..., description="Gross revenue including reversed sales in integer paise")
    reversed_revenue: int = Field(..., description="Total reversed sales value in integer paise")
    reversed_count: int = Field(..., description="Total count of reversed sales transactions")
    days: List[DailySalesDay] = Field(default_factory=list, description="Daily sales breakdown")


# ---------------------------------------------------------------------------
# Purchase Report
# ---------------------------------------------------------------------------
class PurchaseReportDay(BaseModel):
    date: str = Field(..., description="Date (YYYY-MM-DD)")
    net_expenditure: int = Field(..., description="Confirmed active purchase expenditure in integer paise")
    confirmed_count: int = Field(..., description="Count of confirmed active purchase transactions")
    reversed_expenditure: int = Field(..., description="Reversed purchase expenditure in integer paise")
    reversed_count: int = Field(..., description="Count of reversed purchase transactions")


class PurchaseReport(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    total_expenditure: int = Field(..., description="Net confirmed purchase expenditure in integer paise")
    total_transactions: int = Field(..., description="Total count of confirmed active purchase transactions")
    gross_expenditure: int = Field(..., description="Gross expenditure including reversed purchases in integer paise")
    reversed_expenditure: int = Field(..., description="Total reversed purchase expenditure in integer paise")
    reversed_count: int = Field(..., description="Total count of reversed purchase transactions")
    days: List[PurchaseReportDay] = Field(default_factory=list, description="Daily purchase breakdown")


# ---------------------------------------------------------------------------
# Product Sales Report
# ---------------------------------------------------------------------------
class ProductSalesItem(BaseModel):
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    category: str
    base_unit: str
    quantity_sold: int = Field(..., description="Net quantity sold in milli-units of base_unit")
    total_sales_value: int = Field(..., description="Authoritative net sales value in integer paise")
    transaction_count: int = Field(..., description="Number of confirmed sales transactions containing this product")
    reversed_quantity: int = Field(..., description="Quantity of reversed sales in milli-units of base_unit")
    reversed_sales_value: int = Field(..., description="Reversed sales value in integer paise")


class ProductSalesReport(BaseModel):
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    items: List[ProductSalesItem] = Field(default_factory=list)
    total_sales_value: int = Field(..., description="Sum of net sales value across all products in integer paise")
    total_products_sold: int = Field(..., description="Number of distinct products with active sales")


# ---------------------------------------------------------------------------
# Inventory Summary
# ---------------------------------------------------------------------------
class InventorySummaryItem(BaseModel):
    product_id: int
    name: str
    sku: Optional[str] = None
    category: str
    stock_qty: int = Field(..., description="Current stock in milli-units of base_unit")
    base_unit: str
    purchase_price: int = Field(..., description="Current purchase price in integer paise")
    selling_price: int = Field(..., description="Current selling price in integer paise")
    low_stock_threshold: int = Field(..., description="Low stock threshold in milli-units")
    is_low_stock: bool
    active: int
    total_inflow: int = Field(..., description="Total recorded inflow in milli-units (purchases + positive adjustments)")
    total_outflow: int = Field(..., description="Total recorded outflow in milli-units (sales + negative adjustments)")
    conversions: List[dict[str, Any]] = Field(default_factory=list)


class InventorySummaryReport(BaseModel):
    items: List[InventorySummaryItem] = Field(default_factory=list)
    total_products: int
    low_stock_count: int
    total_inventory_cost_value: int = Field(
        ..., description="Total inventory value at purchase price in integer paise (stock_qty * purchase_price // 1000)"
    )
    total_inventory_selling_value: int = Field(
        ..., description="Total inventory value at selling price in integer paise (stock_qty * selling_price // 1000)"
    )


# ---------------------------------------------------------------------------
# Reconciliation Report
# ---------------------------------------------------------------------------
class ReconciliationItem(BaseModel):
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    base_unit: str
    recorded_stock: int = Field(..., description="Stock in products table (milli-units)")
    calculated_stock: int = Field(..., description="Stock calculated from movement audit trail (milli-units)")
    discrepancy: int = Field(..., description="Difference: recorded_stock - calculated_stock (milli-units)")
    movements_count: int = Field(..., description="Count of inventory movements for this product")
    status: str = Field(..., description="'reconciled', 'discrepancy', 'gap_detected', or 'no_movements'")
    issues: List[str] = Field(default_factory=list, description="Diagnostic issue descriptions")


class ReconciliationSummary(BaseModel):
    total_products_checked: int
    reconciled_count: int
    discrepancy_count: int
    gap_detected_count: int
    no_movements_count: int


class ReconciliationReport(BaseModel):
    summary: ReconciliationSummary
    items: List[ReconciliationItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Inventory Movements Ledger (Audit History)
# ---------------------------------------------------------------------------
class MovementListItem(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    transaction_id: Optional[int]
    movement_type: str
    quantity_change: int = Field(..., description="Quantity delta in milli-units")
    stock_before: int = Field(..., description="Stock before movement in milli-units")
    stock_after: int = Field(..., description="Stock after movement in milli-units")
    created_at: str


class MovementListResponse(BaseModel):
    items: List[MovementListItem] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
