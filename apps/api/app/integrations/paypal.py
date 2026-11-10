from typing import Any
import httpx
from app.core.config import get_settings


class PayPalError(RuntimeError):
    pass


async def _token() -> str:
    settings = get_settings()
    if not settings.paypal_client_id or not settings.paypal_client_secret:
        raise PayPalError("PayPal Sandbox credentials are not configured.")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{settings.paypal_base_url}/v1/oauth2/token", auth=(settings.paypal_client_id, settings.paypal_client_secret), data={"grant_type": "client_credentials"}, headers={"Accept": "application/json"})
        if response.status_code >= 400:
            raise PayPalError(f"PayPal OAuth failed: {response.status_code}")
        return response.json()["access_token"]


async def create_order(decision_id: str, amount: str, currency: str = "USD") -> dict[str, Any]:
    token = await _token()
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{settings.paypal_base_url}/v2/checkout/orders", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "PayPal-Request-Id": f"omnibuy-{decision_id}"}, json={"intent": "CAPTURE", "purchase_units": [{"reference_id": decision_id, "custom_id": decision_id, "amount": {"currency_code": currency, "value": amount}}], "application_context": {"brand_name": "OmniBuy AI", "user_action": "PAY_NOW", "return_url": f"{settings.omnibuy_public_url}/checkout", "cancel_url": f"{settings.omnibuy_public_url}/workspace"}})
        if response.status_code >= 400:
            raise PayPalError(f"PayPal order creation failed: {response.status_code} {response.text[:200]}")
        return response.json()


async def capture_order(order_id: str) -> dict[str, Any]:
    token = await _token()
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{settings.paypal_base_url}/v2/checkout/orders/{order_id}/capture", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "PayPal-Request-Id": f"omnibuy-capture-{order_id}"})
        if response.status_code >= 400:
            raise PayPalError(f"PayPal capture failed: {response.status_code} {response.text[:200]}")
        return response.json()
