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
        response = await client.post(f"{settings.channel3_base_url.rstrip('/')}/search", headers={"Authorization": f"Bearer {settings.channel3_api_key}"}, json={"query": query, "currency": currency})
        response.raise_for_status()
        body: dict[str, Any] = response.json()
    products: list[Product] = []
    for item in body.get("products", body.get("results", [])):
        try:
            products.append(Product(id=str(item["id"]), title=item["title"], brand=item.get("brand"), merchant=item["merchant"], price=Decimal(str(item["price"])), currency=item.get("currency", currency), category=item.get("category", "uncategorized"), specifications=item.get("specifications", {}), image_url=item.get("image_url"), product_url=item["product_url"], availability="in_stock" if item.get("availability") in (True, "in_stock", "IN_STOCK") else "unknown", source="channel3"))
        except (KeyError, TypeError, ValueError):
            continue
    return products
