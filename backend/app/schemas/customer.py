"""Pydantic schemas for Customer management and Udhaar Khata (Customer Ledger)."""

from __future__ import annotations

from typing import Annotated, List, Optional
from pydantic import BaseModel, Field, field_validator


class CustomerCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200, description="Customer full name")]
    phone: Annotated[str, Field(default="", max_length=20, description="Customer phone number")] = ""
    address: Annotated[str, Field(default="", max_length=300, description="Customer address / locality")] = ""
    credit_limit: Annotated[int, Field(default=0, ge=0, description="Credit limit in integer paise (0 = unlimited)")] = 0

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Customer name cannot be empty.")
        return clean

    @field_validator("phone", "address")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if value else ""


class CustomerUpdate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    phone: Annotated[str, Field(default="", max_length=20)] = ""
    address: Annotated[str, Field(default="", max_length=300)] = ""
    credit_limit: Annotated[int, Field(default=0, ge=0)] = 0

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Customer name cannot be empty.")
        return clean

    @field_validator("phone", "address")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if value else ""


class CustomerResponse(BaseModel):
    id: int
    name: str
    phone: str
    address: str
    credit_limit: int
    current_balance: int  # in integer paise (positive means customer owes money to shop)
    active: int
    created_at: str
    updated_at: str


class CustomerListResponse(BaseModel):
    items: List[CustomerResponse]
    total: int
    total_outstanding: int  # sum of all positive customer balances in paise


class CustomerPaymentCreate(BaseModel):
    amount: Annotated[int, Field(gt=0, description="Payment amount in integer paise")]
    payment_method: Annotated[str, Field(default="cash", description="Payment method: cash, upi, bank_transfer, other")] = "cash"
    notes: Annotated[str, Field(default="", max_length=300, description="Payment notes or reference")] = ""

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        clean = value.strip().lower()
        if clean not in ("cash", "upi", "bank_transfer", "other"):
            raise ValueError("Payment method must be cash, upi, bank_transfer, or other.")
        return clean

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip() if value else ""


class CustomerLedgerEntryResponse(BaseModel):
    id: int
    customer_id: int
    transaction_id: Optional[int] = None
    entry_type: str  # 'credit_sale', 'payment', 'adjustment'
    amount: int  # integer paise
    balance_after: int  # running balance after this entry in integer paise
    payment_method: Optional[str] = None
    notes: str
    created_at: str


class CustomerDetailResponse(CustomerResponse):
    ledger: List[CustomerLedgerEntryResponse] = []


class CustomerStatementEntry(BaseModel):
    id: int
    date: str
    entry_type: str  # credit_sale, payment, adjustment
    description: str
    debit: int  # in paise (increases balance owed by customer)
    credit: int  # in paise (decreases balance owed by customer)
    balance_after: int  # in paise
    payment_method: Optional[str] = None
    notes: str


class CustomerStatementResponse(BaseModel):
    customer_id: int
    customer_name: str
    customer_phone: str
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    opening_balance: int  # in paise
    total_debit: int  # total credit sales in period in paise
    total_credit: int  # total payments/reversals in period in paise
    closing_balance: int  # final balance in paise
    entries: List[CustomerStatementEntry]
    shareable_text: str  # WhatsApp/SMS ready formatted summary

