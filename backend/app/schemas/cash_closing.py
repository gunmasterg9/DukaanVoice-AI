"""Pydantic schemas for Daily Cash Closing & Reconciliation."""

from __future__ import annotations

from datetime import date
from typing import Annotated, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class CashClosingResponse(BaseModel):
    id: int
    business_date: str
    opening_cash: int  # in integer paise
    cash_sales: int  # in integer paise
    cash_repayments: int  # in integer paise
    cash_expenses: int  # in integer paise
    cash_refunds: int  # in integer paise
    expected_cash: int  # in integer paise
    actual_cash: int  # in integer paise
    difference: int  # in integer paise (positive = surplus, negative = shortage)
    status: str  # 'draft' | 'finalized'
    notes: str
    created_at: str
    closed_at: Optional[str] = None


class CashClosingPreviewResponse(BaseModel):
    business_date: str
    opening_cash: int
    cash_sales: int
    cash_repayments: int
    cash_expenses: int
    cash_refunds: int
    expected_cash: int
    is_already_closed: bool
    existing_closing: Optional[CashClosingResponse] = None


class CashClosingCreate(BaseModel):
    business_date: Annotated[str, Field(description="Business date in YYYY-MM-DD format")]
    opening_cash: Annotated[Optional[int], Field(default=None, ge=0, description="Opening cash in paise")] = None
    actual_cash: Annotated[Optional[int], Field(default=None, ge=0, description="Physical cash counted in drawer in paise")] = None
    counted_cash: Annotated[Optional[int], Field(default=None, ge=0, description="Alias for actual_cash")] = None
    notes: Annotated[str, Field(default="", max_length=500, description="Notes on shortage, surplus, or physical counts")] = ""
    finalize: Annotated[bool, Field(default=False, description="Whether to finalize and lock this closing")] = False

    @model_validator(mode="after")
    def resolve_actual_cash(self):
        if self.actual_cash is None and self.counted_cash is not None:
            self.actual_cash = self.counted_cash
        elif self.actual_cash is None:
            self.actual_cash = 0
        return self

    @field_validator("business_date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            return date.today().isoformat()
        try:
            date.fromisoformat(clean)
        except ValueError:
            raise ValueError("Business date must be in YYYY-MM-DD format.")
        return clean

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return value.strip() if value else ""


class CashClosingListResponse(BaseModel):
    items: List[CashClosingResponse]
    total: int
