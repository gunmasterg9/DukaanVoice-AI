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
    sku: Annotated[str, Field(min_length=1, max_length=100, description="Unique SKU code")]
    category: Annotated[str, Field(default="", max_length=100, description="Product category")]
    base_unit: Annotated[str, Field(min_length=1, max_length=50, description="Standard inventory unit")]
    opening_stock: Annotated[int, Field(default=0, ge=0, description="Opening stock in milli-units (1 unit = 1000)")]
    purchase_price: Annotated[int, Field(default=0, ge=0, description="Purchase price in integer paise")]
    selling_price: Annotated[int, Field(default=0, ge=0, description="Selling price in integer paise")]
    low_stock_threshold: Annotated[int, Field(default=0, ge=0, description="Low stock alert threshold in milli-units")]

    @field_validator("name", "sku", "base_unit")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Field cannot be empty or whitespace only.")
        return clean

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        return value.strip()


class ProductUpdate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    sku: Annotated[str, Field(min_length=1, max_length=100)]
    category: Annotated[str, Field(default="", max_length=100)]
    base_unit: Annotated[str, Field(min_length=1, max_length=50)]
    purchase_price: Annotated[int, Field(default=0, ge=0, description="Purchase price in integer paise")]
    selling_price: Annotated[int, Field(default=0, ge=0, description="Selling price in integer paise")]
    low_stock_threshold: Annotated[int, Field(default=0, ge=0, description="Low stock threshold in milli-units")]

    @field_validator("name", "sku", "base_unit")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Field cannot be empty or whitespace only.")
        return clean

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        return value.strip()


class ProductResponse(BaseModel):
    id: int
    name: str
    sku: str
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
