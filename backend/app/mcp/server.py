"""Official MCP Server instantiation and tool registration for DukaanVoice AI."""

from __future__ import annotations

import json
from typing import Any, Optional, Tuple

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from fastapi import HTTPException
from starlette.applications import Starlette

from app.mcp.tools import (
    get_daily_report_tool,
    get_inventory_tool,
    record_purchase_tool,
    record_sale_tool,
)


def create_mcp_server() -> Tuple[MCPServer, Starlette]:
    """Factory creating a fresh MCPServer instance and Starlette StreamableHTTP sub-app.

    Using a factory ensures each FastAPI app instance receives its own isolated
    session manager, supporting multiple test runs and restarts.
    """
    server = MCPServer("dukaanvoice-alexa-plus", version="1.0.0")

    @server.tool(
        name="get_inventory",
        description="Find products, check current stock levels in base units, and filter low-stock items.",
    )
    def get_inventory(
        query: Optional[str] = None,
        low_stock_only: bool = False,
        limit: int = 50,
    ) -> str:
        """Find products and current stock.

        Args:
            query: Optional search term matching product name or SKU.
            low_stock_only: If True, only returns items where stock is at or below threshold.
            limit: Page size limit (default: 50).
        """
        try:
            res = get_inventory_tool(query=query, low_stock_only=low_stock_only, limit=limit)
            return json.dumps(res, indent=2, ensure_ascii=False)
        except (ValueError, HTTPException, Exception) as exc:
            err_msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            return json.dumps({"status": "error", "error": err_msg, "message": err_msg}, indent=2, ensure_ascii=False)

    @server.tool(
        name="record_sale",
        description="Record a sale. Use confirm=false (default) to generate a proposal with stock delta preview before committing. Use confirm=true to commit.",
    )
    def record_sale(
        product_name_or_sku: str,
        quantity: float,
        unit: Optional[str] = None,
        selling_price: Optional[int] = None,
        idempotency_key: Optional[str] = None,
        confirm: bool = False,
        draft_id: Optional[int] = None,
    ) -> str:
        """Record a sale with two-step safety.

        Args:
            product_name_or_sku: Product name, ID, or SKU.
            quantity: Quantity to sell.
            unit: Optional unit of sale.
            selling_price: Optional selling price in paise.
            idempotency_key: Optional duplicate prevention key.
            confirm: False generates a proposed draft with stock delta; True commits atomically.
            draft_id: Optional draft ID to confirm.
        """
        try:
            res = record_sale_tool(
                product_name_or_sku=product_name_or_sku,
                quantity=quantity,
                unit=unit,
                selling_price=selling_price,
                idempotency_key=idempotency_key,
                confirm=confirm,
                draft_id=draft_id,
            )
            return json.dumps(res, indent=2, ensure_ascii=False)
        except (ValueError, HTTPException, Exception) as exc:
            err_msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            return json.dumps({"status": "error", "error": err_msg, "message": err_msg}, indent=2, ensure_ascii=False)

    @server.tool(
        name="record_purchase",
        description="Record incoming stock. Use confirm=false to preview stock increase. Use confirm=true to commit.",
    )
    def record_purchase(
        product_name_or_sku: str,
        quantity: float,
        unit: Optional[str] = None,
        purchase_price: Optional[int] = None,
        idempotency_key: Optional[str] = None,
        confirm: bool = False,
        draft_id: Optional[int] = None,
    ) -> str:
        """Record incoming inventory receipt.

        Args:
            product_name_or_sku: Product identifier.
            quantity: Quantity received.
            unit: Optional unit.
            purchase_price: Unit purchase price in paise.
            idempotency_key: Optional idempotency key.
            confirm: False previews stock increase; True commits atomically.
            draft_id: Draft transaction ID to confirm.
        """
        try:
            res = record_purchase_tool(
                product_name_or_sku=product_name_or_sku,
                quantity=quantity,
                unit=unit,
                purchase_price=purchase_price,
                idempotency_key=idempotency_key,
                confirm=confirm,
                draft_id=draft_id,
            )
            return json.dumps(res, indent=2, ensure_ascii=False)
        except (ValueError, HTTPException, Exception) as exc:
            err_msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            return json.dumps({"status": "error", "error": err_msg, "message": err_msg}, indent=2, ensure_ascii=False)

    @server.tool(
        name="get_daily_report",
        description="Get verified business summary and sales total for a requested business date.",
    )
    def get_daily_report(
        business_date: Optional[str] = None,
    ) -> str:
        """Get verified daily business sales report.

        Args:
            business_date: Optional date string in YYYY-MM-DD format (defaults to current date).
        """
        try:
            res = get_daily_report_tool(business_date=business_date)
            return json.dumps(res, indent=2, ensure_ascii=False)
        except (ValueError, HTTPException, Exception) as exc:
            err_msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            return json.dumps({"status": "error", "error": err_msg, "message": err_msg}, indent=2, ensure_ascii=False)

    security = TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
        allowed_hosts=["*"],
        allowed_origins=["*"],
    )
    sub_app = server.streamable_http_app(
        streamable_http_path="/",
        transport_security=security,
        json_response=True,
    )
    return server, sub_app
