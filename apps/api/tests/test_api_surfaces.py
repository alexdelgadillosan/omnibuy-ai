"""Route-level tests for health, policy validation, events and discovery/proposals."""
from decimal import Decimal

from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.persistence.db import DEFAULT_POLICY
from app.schemas.products import Product, PurchaseRequest

client = TestClient(app)


def candidate(pid: str, price: str, quality: int = 80, category: str = "electronics", merchant: str = "Amazon") -> dict:
    return {
        "id": pid,
        "title": f"{pid} product",
        "merchant": merchant,
        "price": price,
        "currency": "USD",
        "category": category,
        "specifications": {"quality_score": quality},
        "product_url": f"https://example.com/{pid}",
        "availability": "in_stock",
        "source": "test",
    }


def test_health_endpoint_reports_service_status(database):
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["service"] == "omnibuy-ai"
    assert body["payments"] == "paypal-sandbox"
    assert body["discovery"] == "channel3"


def test_policy_put_rejects_invalid_settings(database):
    assert client.put("/api/policy", json={**DEFAULT_POLICY, "currency": "EUR"}).status_code == 422
    assert client.put("/api/policy", json={**DEFAULT_POLICY, "human_approval_required": False}).status_code == 422
    assert client.put("/api/policy", json={**DEFAULT_POLICY, "budget_cap": 0}).status_code == 422
    assert client.put("/api/policy", json={**DEFAULT_POLICY, "monthly_cap": -1}).status_code == 422
    assert client.put("/api/policy", json={**DEFAULT_POLICY, "max_item_price": 100001}).status_code == 422


def test_policy_put_cleans_and_dedupes_terms_case_insensitively(database):
    response = client.put(
        "/api/policy",
        json={**DEFAULT_POLICY, "allowed_merchants": ["  Dell  ", "", "dell", "Amazon"], "restricted_categories": ["Weapons", "weapons", " "]},
    )
    assert response.status_code == 200
    settings = response.json()["settings"]
    assert settings["allowed_merchants"] == ["Dell", "Amazon"]
    assert settings["restricted_categories"] == ["Weapons"]
    assert settings["human_approval_required"] is True


def test_policy_events_limit_is_clamped(database):
    for index in range(5):
        client.post("/api/policy/simulate", json={"amount": 10 + index})

    assert len(client.get("/api/policy/events?limit=0").json()) >= 1
    assert len(client.get("/api/policy/events?limit=1000").json()) <= 100
    events = client.get("/api/policy/events?limit=2").json()
    assert len(events) == 2
    assert all(set(event) >= {"event_id", "action", "outcome", "created_at"} for event in events)


def test_simulation_records_an_event_and_reports_settings(database):
    response = client.post("/api/policy/simulate", json={"amount": 25, "category": "toys", "merchant": "AnyShop"}).json()
    assert response["status"] == "AWAITING_APPROVAL"
    assert response["settings"]["currency"] == "USD"
    assert any(check["name"] == "human_approval" and not check["passed"] for check in response["checks"])
    assert client.get("/api/policy/events?limit=1").json()[0]["action"] == "simulation"


def test_discovery_returns_live_products(database, monkeypatch):
    async def fake_search(query: str, currency: str = "USD"):
        product = Product(
            id="live-1",
            title="Live product",
            merchant="live.shop",
            price=Decimal("12.34"),
            currency="USD",
            category="electronics",
            product_url="https://example.com/live",
            source="channel3",
        )
        return [product]

    monkeypatch.setattr(routes, "search_channel3", fake_search)
    body = client.get("/api/discovery?query=cables").json()
    assert body["count"] == 1
    assert body["products"][0]["id"] == "live-1"
    assert body["query"] == "cables"


def test_discovery_unavailable_returns_503_without_faking_data(database, monkeypatch):
    from app.integrations.channel3 import DiscoveryUnavailable

    async def unavailable(query: str, currency: str = "USD"):
        raise DiscoveryUnavailable("Channel3 is not configured.")

    monkeypatch.setattr(routes, "search_channel3", unavailable)
    response = client.get("/api/discovery")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_discovery_generic_failure_returns_502(database, monkeypatch):
    async def broken(query: str, currency: str = "USD"):
        raise RuntimeError("network down")

    monkeypatch.setattr(routes, "search_channel3", broken)
    response = client.get("/api/discovery")
    assert response.status_code == 502
    assert "network down" in response.json()["detail"]


def test_proposal_from_inline_candidates_creates_awaiting_proof(database):
    response = client.post(
        "/api/proposals",
        json={"request": "buy a cable", "budget": 50, "candidates": [candidate("cable-1", "19.99")]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "AWAITING_APPROVAL"
    proof = body["proof"]
    assert proof["status"] == "awaiting_approval"
    assert proof["optimization"]["total"] == "19.99"
    assert proof["integrity_hash"]

    stored = client.get(f"/api/decision-proofs/{proof['decision_id']}").json()
    assert stored["integrity_verified"] is True


def test_proposal_that_violates_policy_is_blocked_without_payment(database):
    response = client.post(
        "/api/proposals",
        json={"request": "buy a cable", "budget": 5, "candidates": [candidate("cable-1", "19.99")]},
    )
    body = response.json()
    assert body["state"] == "BLOCKED"
    assert body["proof"]["status"] == "blocked"
    # The optimizer cannot build a compliant cart, so the empty-cart check fails.
    assert any(check["name"] == "non_empty_cart" and not check["passed"] for check in body["proof"]["policy"]["checks"])
    order = client.post(f"/api/paypal/orders?decision_id={body['proof']['decision_id']}")
    assert order.status_code == 409


def test_proposal_discovery_failure_returns_503(database, monkeypatch):
    from app.integrations.channel3 import DiscoveryUnavailable

    async def unavailable(query: str, currency: str = "USD"):
        raise DiscoveryUnavailable("Channel3 is not configured.")

    monkeypatch.setattr(routes, "search_channel3", unavailable)
    response = client.post("/api/proposals", json={"request": "buy a cable", "budget": 50})
    assert response.status_code == 503
