"""Unit tests for the PayPal and Channel3 integrations, workflow and proof hashing."""
import asyncio
import json
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.agents.workflow import run_workflow
from app.integrations import paypal
from app.integrations.channel3 import DiscoveryUnavailable, search_channel3
from app.integrations.paypal import PayPalError, capture_order, create_order
from app.policies.engine import verify_policy
from app.schemas.products import OptimizationResult, Product, PurchaseRequest
from app.services.proof import create_decision_proof, proof_hash


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeAsyncClient:
    calls: list = []
    responses: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exception):
        return False

    async def post(self, url, **kwargs):
        type(self).calls.append((url, kwargs))
        return type(self).responses.pop(0)


@pytest.fixture
def fake_http(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.responses = []
    monkeypatch.setattr(paypal.httpx, "AsyncClient", FakeAsyncClient)
    import app.integrations.channel3 as channel3

    monkeypatch.setattr(channel3.httpx, "AsyncClient", FakeAsyncClient)
    return FakeAsyncClient


def fake_settings(**overrides):
    base = {
        "channel3_api_key": "test-key",
        "channel3_base_url": "https://channel3.test/v1",
        "paypal_client_id": "client",
        "paypal_client_secret": "secret",
        "paypal_base_url": "https://paypal.test",
        "omnibuy_public_url": "https://omnibuy.test",
    }
    return SimpleNamespace(**{**base, **overrides})


def product(pid: str, price: str, category: str = "cables", quality: int = 80) -> Product:
    return Product(
        id=pid,
        title=pid,
        merchant="Verified Merchant",
        price=Decimal(price),
        currency="USD",
        category=category,
        specifications={"quality_score": quality},
        product_url=f"https://example.com/{pid}",
        availability="in_stock",
        source="test",
    )


# --- PayPal integration -----------------------------------------------------


def test_create_order_rejects_non_usd_before_any_http_call(database, monkeypatch):
    async def explode():
        raise AssertionError("no HTTP call may happen for non-USD orders")

    monkeypatch.setattr(paypal, "_token", explode)
    with pytest.raises(PayPalError, match="USD"):
        asyncio.run(create_order("DEC-1", "10.00", "EUR"))


def test_create_order_sends_decision_reference_and_idempotency_key(database, monkeypatch, fake_http):
    monkeypatch.setattr(paypal, "get_settings", lambda: fake_settings())
    fake_http.responses.append(FakeResponse({"access_token": "TOKEN-123"}))
    fake_http.responses.append(FakeResponse({"id": "ORDER-UNIT-1", "status": "CREATED", "links": []}))

    order = asyncio.run(create_order("DEC-UNIT-1", "19.99"))

    assert order["id"] == "ORDER-UNIT-1"
    url, kwargs = fake_http.calls[-1]
    assert url.endswith("/v2/checkout/orders")
    assert kwargs["headers"]["PayPal-Request-Id"] == "omnibuy-DEC-UNIT-1"
    unit = kwargs["json"]["purchase_units"][0]
    assert unit["reference_id"] == "DEC-UNIT-1"
    assert unit["custom_id"] == "DEC-UNIT-1"
    assert unit["amount"] == {"currency_code": "USD", "value": "19.99"}


def test_create_order_maps_paypal_failures_to_paypal_error(database, monkeypatch, fake_http):
    monkeypatch.setattr(paypal, "get_settings", lambda: fake_settings())
    fake_http.responses.append(FakeResponse({"access_token": "TOKEN-123"}))
    fake_http.responses.append(FakeResponse({}, status_code=500))
    with pytest.raises(PayPalError, match="order creation failed"):
        asyncio.run(create_order("DEC-UNIT-2", "19.99"))


def test_capture_order_maps_paypal_failures_to_paypal_error(database, monkeypatch, fake_http):
    monkeypatch.setattr(paypal, "get_settings", lambda: fake_settings())
    fake_http.responses.append(FakeResponse({"access_token": "TOKEN-123"}))
    fake_http.responses.append(FakeResponse({}, status_code=404))
    with pytest.raises(PayPalError, match="capture failed"):
        asyncio.run(capture_order("ORDER-404"))


def test_token_requires_paypal_credentials(database, monkeypatch):
    monkeypatch.setattr(paypal, "get_settings", lambda: fake_settings(paypal_client_id="", paypal_client_secret=""))
    with pytest.raises(PayPalError, match="credentials are not configured"):
        asyncio.run(paypal._token())


def test_token_returns_oauth_access_token(database, monkeypatch, fake_http):
    monkeypatch.setattr(paypal, "get_settings", lambda: fake_settings())
    fake_http.responses.append(FakeResponse({"access_token": "TOKEN-123"}))
    assert asyncio.run(paypal._token()) == "TOKEN-123"


# --- Channel3 integration ---------------------------------------------------


def test_channel3_without_configuration_raises_discovery_unavailable(database, monkeypatch):
    import app.integrations.channel3 as channel3

    monkeypatch.setattr(channel3, "get_settings", lambda: fake_settings(channel3_api_key=""))
    with pytest.raises(DiscoveryUnavailable):
        asyncio.run(search_channel3("cables"))


def test_channel3_parses_offers_into_verified_products(database, monkeypatch, fake_http):
    import app.integrations.channel3 as channel3

    monkeypatch.setattr(channel3, "get_settings", lambda: fake_settings())
    payload = {
        "products": [
            {
                "id": "ch-1",
                "title": "USB-C cable",
                "brands": [{"name": "Belkin"}],
                "category": {"title": "cables"},
                "offers": [
                    {"domain": "bestbuy.com", "price": {"price": 19.99, "currency": "USD"}, "availability": "InStock", "url": "https://bestbuy.com/cable"}
                ],
                "images": [{"is_main_image": True, "cleaned_url": "https://img.test/cable.jpg"}],
                "ratings": {"value": 4.5, "count": 20},
            }
        ]
    }
    fake_http.responses.append(FakeResponse(payload))

    products = asyncio.run(search_channel3("cables", "USD"))

    assert len(products) == 1
    offer = products[0]
    assert offer.merchant == "bestbuy.com"
    assert offer.price == Decimal("19.99")
    assert offer.brand == "Belkin"
    assert offer.category == "cables"
    assert str(offer.image_url) == "https://img.test/cable.jpg"
    assert offer.availability == "in_stock"
    # Bayesian shrink: (4.5/5*100*20 + 70*5) / (20 + 5) = 86.0
    assert offer.specifications["quality_score"] == 86.0
    assert offer.specifications["rating_count"] == 20


def test_channel3_ignores_malformed_items_instead_of_failing(database, monkeypatch, fake_http):
    import app.integrations.channel3 as channel3

    monkeypatch.setattr(channel3, "get_settings", lambda: fake_settings())
    fake_http.responses.append(FakeResponse({"products": [{"id": "bad"}, {"id": "bad-2", "title": "no offers"}, 42]}))

    assert asyncio.run(search_channel3("cables")) == []


# --- Workflow and proof service ---------------------------------------------


def test_workflow_runs_all_stages_and_reports_events(database):
    request = PurchaseRequest(request="office", budget=Decimal("100"), required_categories=["cables"])
    state = run_workflow(request, [product("cable-1", "20", category="cables")])

    assert state["optimization"].total == Decimal("20")
    assert state["optimization"].missing_categories == []
    assert verify_policy(request, state["optimization"]).passed is True
    assert [event["type"] for event in state["events"]] == [
        "intent_parsed",
        "products_found",
        "optimization_completed",
        "policy_passed",
    ]


def test_proof_hash_is_deterministic_and_sensitive_to_immutable_fields(database):
    request = PurchaseRequest(request="office", budget=Decimal("100"))
    result = OptimizationResult(
        selected=[product("cable-1", "20")],
        total=Decimal("20"),
        remaining_budget=Decimal("80"),
        quality_score=Decimal("80"),
        satisfied_categories=["cables"],
        missing_categories=[],
        evaluated_candidates=1,
    )
    policy = verify_policy(request, result)
    proof = create_decision_proof(request, result, policy, {})

    assert proof["integrity_hash"] == proof_hash(proof)
    assert proof["status"] == "awaiting_approval"
    assert proof["decision_id"].startswith("DEC-")

    mutated = {**proof, "optimization": {**proof["optimization"], "total": "999.99"}}
    assert proof_hash(mutated) != proof["integrity_hash"]
