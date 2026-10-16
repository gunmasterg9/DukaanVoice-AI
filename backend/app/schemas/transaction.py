"""Pydantic schemas for sales and purchase transactions."""

from __future__ import annotations

from typing import Annotated, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class TransactionItemCreate(BaseModel):
    product_id: Annotated[int, Field(gt=0, description="Target product ID")]
    quantity: Annotated[int, Field(gt=0, description="Quantity in milli-units (1 unit = 1000)")]
    unit: Annotated[str, Field(min_length=1, max_length=50, description="Item unit (e.g. kg, box)")]
    unit_price: Annotated[int, Field(ge=0, description="Price per single unit in integer paise")]

    @field_validator("unit")
    @classmethod
    def strip_unit(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Unit must not be empty.")
        return clean


class TransactionCreate(BaseModel):
    type: Annotated[Literal["sale", "purchase"], Field(description="Transaction type")]
    items: Annotated[List[TransactionItemCreate], Field(min_length=1, description="List of line items")]
    idempotency_key: Annotated[Optional[str], Field(default=None, max_length=100, description="Unique client key")]
    original_instruction: Annotated[str, Field(default="", max_length=500, description="User instruction / note")]
    payment_method: Annotated[str, Field(default="cash", description="Payment method: cash, upi, credit")] = "cash"
    customer_id: Optional[int] = Field(default=None, description="Customer ID for credit sales (Udhaar)")

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        clean = value.strip().lower()
        if clean not in ("cash", "upi", "credit"):
            raise ValueError("Payment method must be cash, upi, or credit.")
        return clean

    @field_validator("idempotency_key")
    @classmethod
    def clean_idempotency_key(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        clean = value.strip()
        return clean or None


class TransactionItemResponse(BaseModel):
    id: int
    transaction_id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    quantity: int
    unit: str
    unit_price: int
    line_total: int
    base_unit: str
    base_quantity: int


class InventoryMovementResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    transaction_id: Optional[int] = None
    movement_type: str
    quantity_change: int
    stock_before: int
    stock_after: int
    created_at: str


class TransactionResponse(BaseModel):
    id: int
    type: str
    status: str
    payment_method: str = "cash"
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    idempotency_key: Optional[str]
    original_instruction: str
    created_at: str
    confirmed_at: Optional[str]
    total_amount: int
    total_items: int
    items: List[TransactionItemResponse] = []


class TransactionDetailResponse(TransactionResponse):
    movements: List[InventoryMovementResponse] = []


class TransactionListResponse(BaseModel):
    items: List[TransactionResponse]
    total: int
    limit: int
    offset: int
    total_revenue: int  # in paise
    total_expense: int  # in paise
