from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.persistence.db import DEFAULT_POLICY

client = TestClient(app)


def payload(**overrides) -> dict:
    return {**DEFAULT_POLICY, **overrides}


def candidate(pid: str, price: str, quality: int, merchant: str = "Amazon", category: str = "electronics") -> dict:
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


def test_policy_api_persists_edits_and_drives_simulation(database):
    update = client.put("/api/policy", json=payload(budget_cap=1200, allowed_merchants=["Dell Direct"], restricted_categories=["weapons", "gift cards"]))
    assert update.status_code == 200

    stored = client.get("/api/policy").json()
    assert stored["settings"]["budget_cap"] == 1200
    assert stored["settings"]["allowed_merchants"] == ["Dell Direct"]
    assert stored["settings"]["restricted_categories"] == ["weapons", "gift cards"]

    blocked = client.post("/api/policy/simulate", json={"amount": 200, "merchant": "Amazon"}).json()
    assert blocked["status"] == "BLOCKED"
    assert any(check["name"] == "merchant_allowlist" and not check["passed"] for check in blocked["checks"])

    missing = client.post("/api/policy/simulate", json={"amount": 200}).json()
    assert missing["status"] == "BLOCKED"
    assert any(check["name"] == "merchant_allowlist" and not check["passed"] for check in missing["checks"])

    allowed = client.post("/api/policy/simulate", json={"amount": 200, "merchant": "Dell Direct"}).json()
    assert allowed["status"] == "AWAITING_APPROVAL"

    reset = client.post("/api/policy/reset").json()
    assert reset["settings"]["budget_cap"] == DEFAULT_POLICY["budget_cap"]
    assert reset["settings"]["allowed_merchants"] == []


def test_policy_simulation_enforces_monthly_cap(database):
    client.put("/api/policy", json=payload(monthly_cap=100))

    response = client.post("/api/policy/simulate", json={"amount": 101})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "BLOCKED"
    assert any(check["name"] == "monthly_cap" and not check["passed"] for check in body["checks"])


def test_approval_cannot_be_disabled_through_the_api(database):
    response = client.put("/api/policy", json=payload(human_approval_required=False))
    assert response.status_code == 422


def test_proposal_uses_live_policy_allowlist(database, no_intent_llm):
    client.put("/api/policy", json=payload(allowed_merchants=["Dell Direct"]))
    response = client.post("/api/proposals", json={
        "request": "buy a monitor",
        "budget": 500,
        "objective": "lowest_cost",
        "allowed_merchants": ["Amazon"],
        "candidates": [candidate("monitor", "320", 80)],
    })
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "BLOCKED"
    assert body["proof"]["status"] == "blocked"
    assert any(check["name"] == "merchant_allowlist" and not check["passed"] for check in body["proof"]["policy"]["checks"])


def test_scenario_b_over_budget_is_deterministically_blocked(database, no_intent_llm):
    response = client.post("/api/proposals", json={
        "request": "buy a laptop under $20",
        "budget": 20,
        "objective": "lowest_cost",
        "required_categories": ["laptop"],
        "candidates": [candidate("laptop", "25", 90, category="laptop")],
    })
    body = response.json()
    assert body["state"] == "BLOCKED"
    assert body["proof"]["selected_products"] == []
    assert any(check["name"] == "non_empty_cart" and not check["passed"] for check in body["proof"]["policy"]["checks"])


def test_scenario_c_reoptimization_changes_the_bundle(database, no_intent_llm):
    candidates = [candidate("cheap-camera", "20", 60, category="camera"), candidate("premium-camera", "80", 96, category="camera")]
    base = {"request": "buy a camera", "budget": 100, "candidates": candidates}

    cheapest = client.post("/api/proposals", json={**base, "objective": "lowest_cost"}).json()["proof"]
    best = client.post("/api/proposals", json={**base, "objective": "best_value"}).json()["proof"]

    assert cheapest["selected_products"][0]["id"] == "cheap-camera"
    assert best["selected_products"][0]["id"] == "premium-camera"
    assert Decimal(cheapest["optimization"]["total"]) < Decimal(best["optimization"]["total"])
