from decimal import Decimal
from typing import Any
import httpx
from app.core.config import get_settings
from app.schemas.products import Product


class DiscoveryUnavailable(RuntimeError):
    pass


async def search_channel3(query: str, currency: str = "USD") -> list[Product]:
    settings = get_settings()
    if not settings.channel3_api_key or not settings.channel3_base_url:
        raise DiscoveryUnavailable("Channel3 is not configured. Set CHANNEL3_API_KEY and CHANNEL3_BASE_URL.")
    # The URL and payload are configured rather than guessed. Confirm the exact
    # endpoint from the account's official Channel3 API documentation.
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{settings.channel3_base_url.rstrip('/')}/search", headers={"x-api-key": settings.channel3_api_key, "Content-Type": "application/json"}, json={"query": query, "limit": 20})
        response.raise_for_status()
        body: dict[str, Any] = response.json()
    products: list[Product] = []
    for item in body.get("products", body.get("results", [])):
        if not isinstance(item, dict):
            continue
        try:
            offers = [candidate for candidate in (item.get("offers") or []) if isinstance(candidate, dict)]
            offer = next((candidate for candidate in offers if candidate.get("price", {}).get("currency") == currency and candidate.get("availability") == "InStock"), None)
            if offer is None and offers:
                offer = offers[0]
            if not offer:
                continue
            price = offer.get("price", {})
            brand = (item.get("brands") or [{}])[0].get("name")
            category = (item.get("category") or {}).get("title", "uncategorized")
            image = next((image.get("cleaned_url") or image.get("url") for image in item.get("images", []) if image.get("is_main_image")), None)
            ratings = item.get("ratings") or {}
            rating_count = int(ratings.get("count") or 0)
            rating_value = float(ratings.get("value") or 0)
            # Deterministic quality signal: Bayesian-shrunk buyer rating. Unrated
            # products receive the neutral prior (70) instead of an invented score.
            quality_score = round((rating_value / 5 * 100 * rating_count + 70 * 5) / (rating_count + 5), 2) if rating_count > 0 and rating_value > 0 else 70.0
            specifications = {
                "key_features": item.get("key_features") or [],
                "structured_attributes": item.get("structured_attributes") or {},
                "quality_score": quality_score,
                "rating_value": round(rating_value, 2) if rating_count > 0 else None,
                "rating_count": rating_count,
            }
            products.append(Product(id=str(item["id"]), title=item["title"], brand=brand, merchant=offer.get("domain", "unknown"), price=Decimal(str(price["price"])), currency=price.get("currency", currency), category=category, specifications=specifications, image_url=image, product_url=offer["url"], availability="in_stock" if offer.get("availability") == "InStock" else "out_of_stock", source="channel3"))
        except (KeyError, TypeError, ValueError):
            continue
    return products
