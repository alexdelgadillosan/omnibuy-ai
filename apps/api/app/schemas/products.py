from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from pydantic import BaseModel, Field, HttpUrl


class Product(BaseModel):
    id: str
    title: str
    brand: str | None = None
    merchant: str
    price: Decimal = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    category: str
    specifications: dict[str, Any] = Field(default_factory=dict)
    image_url: HttpUrl | None = None
    product_url: HttpUrl
    availability: Literal["in_stock", "out_of_stock", "unknown"] = "unknown"
    source: str
    retrieved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PurchaseRequest(BaseModel):
    request: str = Field(min_length=3, max_length=4000)
    budget: Decimal = Field(gt=0, le=100000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    objective: Literal["lowest_cost", "best_value", "highest_quality"] = "best_value"
    required_categories: list[str] = Field(default_factory=list, max_length=20)
    allowed_merchants: list[str] = Field(default_factory=list, max_length=50)
    restricted_categories: list[str] = Field(default_factory=list, max_length=50)
    max_price_per_item: Decimal | None = Field(default=None, gt=0)


class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=20)


class OptimizationResult(BaseModel):
    selected: list[Product]
    alternatives: list[list[Product]] = Field(default_factory=list)
    total: Decimal
    remaining_budget: Decimal
    quality_score: Decimal
    satisfied_categories: list[str]
    missing_categories: list[str]
    evaluated_candidates: int
