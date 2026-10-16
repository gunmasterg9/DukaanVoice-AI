"""Pydantic schemas for Expense Register."""

from __future__ import annotations

from datetime import date
from typing import Annotated, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

EXPENSE_CATEGORIES = [
    "rent",
    "electricity",
    "transport",
    "wages",
    "packaging",
    "maintenance",
    "miscellaneous",
]


class ExpenseCreate(BaseModel):
    expense_date: Annotated[str, Field(default="", validate_default=True, description="Expense date (YYYY-MM-DD)")] = ""
    category: Annotated[str, Field(min_length=1, max_length=100, description="Expense category")]
    amount: Annotated[int, Field(gt=0, description="Expense amount in integer paise")]
    payment_method: Annotated[
        Literal["cash", "upi", "bank_transfer"],
        Field(description="Payment method used for expense"),
    ]
    notes: Annotated[str, Field(default="", max_length=500, description="Notes or invoice/bill reference")] = ""

    @field_validator("expense_date", mode="before")
    @classmethod
    def validate_date(cls, value: Any) -> str:
        if not value or not str(value).strip():
            return date.today().isoformat()
        clean = str(value).strip()
        # Verify YYYY-MM-DD
        try:
            date.fromisoformat(clean)
        except ValueError:
            raise ValueError("Expense date must be in YYYY-MM-DD format.")
        return clean

    @field_validator("category")
    @classmethod
    def clean_category(cls, value: str) -> str:
        clean = value.strip().lower()
        if clean not in EXPENSE_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}")
        return clean

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return value.strip() if value else ""


class ExpenseUpdate(BaseModel):
    expense_date: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[int] = Field(default=None, gt=0)
    payment_method: Optional[Literal["cash", "upi", "bank_transfer"]] = None
    notes: Optional[str] = None


class ExpenseResponse(BaseModel):
    id: int
    expense_date: str
    category: str
    amount: int  # in integer paise
    payment_method: str
    notes: str
    status: str  # active, reversed
    reversed_at: Optional[str] = None
    reversal_reason: Optional[str] = None
    created_at: str
    updated_at: str


class ExpenseReversalRequest(BaseModel):
    reason: Annotated[str, Field(default="", max_length=300, description="Reason for reversing expense")] = ""


class ExpenseListResponse(BaseModel):
    items: List[ExpenseResponse]
    total: int
    total_amount: int  # sum of active expenses in paise
    cash_total: int
    upi_total: int
    bank_total: int
    category_totals: dict[str, int] = Field(default_factory=dict)
    limit: int
    offset: int

