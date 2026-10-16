"""Pydantic schemas for product management and unit conversions."""

from __future__ import annotations

from typing import Annotated, List, Optional
from pydantic import BaseModel, Field, field_validator


class UnitConversionCreate(BaseModel):
    from_unit: Annotated[str, Field(min_length=1, max_length=50, description="Source unit (e.g. box, bag)")]
    to_unit: Annotated[str, Field(min_length=1, max_length=50, description="Target unit (e.g. piece, kg)")]
    factor: Annotated[int, Field(gt=0, description="Milli-units of to_unit per 1 from_unit")]

    @field_validator("from_unit", "to_unit")
    @classmethod
    def strip_and_validate_unit(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Unit name must not be empty.")
        return clean


class UnitConversionUpdate(BaseModel):
    from_unit: Annotated[str, Field(min_length=1, max_length=50)]
    to_unit: Annotated[str, Field(min_length=1, max_length=50)]
    factor: Annotated[int, Field(gt=0)]

    @field_validator("from_unit", "to_unit")
    @classmethod
    def strip_and_validate_unit(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Unit name must not be empty.")
        return clean


class UnitConversionResponse(BaseModel):
    id: int
    product_id: int
    from_unit: str
    to_unit: str
    factor: int


class ProductCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200, description="Product name")]
    sku: Optional[str] = Field(default=None, max_length=100, description="Optional SKU code")
    category: Annotated[str, Field(default="", max_length=100, description="Product category")] = ""
    base_unit: Annotated[str, Field(default="piece", min_length=1, max_length=50, description="Standard inventory unit")] = "piece"
    opening_stock: Annotated[int, Field(default=0, ge=0, description="Opening stock in milli-units (1 unit = 1000)")] = 0
    purchase_price: Annotated[int, Field(default=0, ge=0, description="Purchase price in integer paise (optional)")] = 0
    selling_price: Annotated[int, Field(default=0, ge=0, description="Selling price in integer paise")] = 0
    low_stock_threshold: Annotated[int, Field(default=0, ge=0, description="Low stock alert threshold in milli-units")] = 0

    @field_validator("base_unit", mode="before")
    @classmethod
    def default_base_unit(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "piece"
        return str(value).strip()

    @field_validator("name")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Field cannot be empty or whitespace only.")
        return clean

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        clean = value.strip()
        return clean if clean else None

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        return value.strip() if value else ""

    @field_validator("purchase_price", "opening_stock", "low_stock_threshold", mode="before")
    @classmethod
    def default_optional_ints(cls, value: Any) -> int:
        if value is None or value == "":
            return 0
        return int(value)


class ProductUpdate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    sku: Optional[str] = Field(default=None, max_length=100, description="Optional SKU code")
    category: Annotated[str, Field(default="", max_length=100)] = ""
    base_unit: Annotated[str, Field(default="piece", min_length=1, max_length=50)] = "piece"
    purchase_price: Annotated[int, Field(default=0, ge=0, description="Purchase price in integer paise")] = 0
    selling_price: Annotated[int, Field(default=0, ge=0, description="Selling price in integer paise")]
    low_stock_threshold: Annotated[int, Field(default=0, ge=0, description="Low stock threshold in milli-units")] = 0

    @field_validator("base_unit", mode="before")
    @classmethod
    def default_base_unit(cls, value: Any) -> str:
        if value is None or str(value).strip() == "":
            return "piece"
        return str(value).strip()

    @field_validator("name")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Field cannot be empty or whitespace only.")
        return clean

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        clean = value.strip()
        return clean if clean else None

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        return value.strip() if value else ""

    @field_validator("purchase_price", "low_stock_threshold", mode="before")
    @classmethod
    def default_optional_ints(cls, value: Any) -> int:
        if value is None or value == "":
            return 0
        return int(value)


class ProductResponse(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    category: str
    stock_qty: int
    base_unit: str
    purchase_price: int
    selling_price: int
    low_stock_threshold: int
    active: int
    created_at: str
    updated_at: str
    is_low_stock: bool


class ProductDetailResponse(ProductResponse):
    conversions: List[UnitConversionResponse] = []


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    limit: int
    offset: int


class ReorderItemSpec(BaseModel):
    product_id: int
    quantity: Optional[int] = None
    unit: Optional[str] = None
    unit_price: Optional[int] = None


class ReorderDraftRequest(BaseModel):
    items: Optional[List[ReorderItemSpec]] = None
    note: Optional[str] = None
