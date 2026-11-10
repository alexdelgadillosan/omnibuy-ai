import json
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import routes
from app.main import app
from app.persistence.db import DEFAULT_POLICY
from app.policies.engine import verify_policy
from app.schemas.products import OptimizationResult, Product, PurchaseRequest
from app.services.proof import create_decision_proof, proof_hash

client = TestClient(app)


def seed_proof(database) -> dict:
    request = PurchaseRequest(request="buy a usb cable", budget=Decimal("50"), objective="lowest_cost")
    selected = Product(
        id="cable-1",
        title="USB-C cable",
        merchant="Verified Merchant",
        price=Decimal("8.49"),
        currency="USD",
        category="cables",
        specifications={"quality_score": 82},
        product_url="https://example.com/cable",
        availability="in_stock",
        source="test",
    )
    result = OptimizationResult(selected=[selected], total=Decimal("8.49"), remaining_budget=Decimal("41.51"), quality_score=Decimal("82"), satisfied_categories=[], missing_categories=[], evaluated_candidates=1)
    settings = {**DEFAULT_POLICY, "monthly_cap": 100000.0}
    policy = verify_policy(request, result, settings)
    proof = create_decision_proof(request, result, policy, settings)
    proof["workflow_events"] = []
    database.save_proof(proof)
    return proof


def test_paypal_requires_human_approval_and_blocks_duplicate_orders(database, monkeypatch):
    proof = seed_proof(database)
    decision_id = proof["decision_id"]

    assert client.post(f"/api/paypal/orders?decision_id={decision_id}").status_code == 409

    approval = client.post(f"/api/decision-proofs/{decision_id}/approve")
    assert approval.status_code == 200
    assert client.post(f"/api/decision-proofs/{decision_id}/approve").status_code == 409
    assert client.post(f"/api/decision-proofs/{decision_id}/reject").status_code == 409

    calls = {"create": 0}

    async def fake_create(decision_id: str, amount: str, currency: str = "USD"):
        calls["create"] += 1
        return {"id": "ORDER-TEST-1", "status": "CREATED", "links": [{"rel": "approve", "href": "https://sandbox.paypal.com/checkoutnow?token=ORDER-TEST-1"}]}

    monkeypatch.setattr(routes, "create_order", fake_create)

    order = client.post(f"/api/paypal/orders?decision_id={decision_id}")
    assert order.status_code == 200
    assert order.json()["paypal_order_id"] == "ORDER-TEST-1"
    assert database.get_proof(decision_id)["status"] == "checkout_pending"

    duplicate = client.post(f"/api/paypal/orders?decision_id={decision_id}")
    assert duplicate.status_code == 409
    assert calls["create"] == 1


def test_paypal_capture_is_persisted_once(database, monkeypatch):
    proof = seed_proof(database)
    decision_id = proof["decision_id"]
    client.post(f"/api/decision-proofs/{decision_id}/approve")

    async def fake_create(decision_id: str, amount: str, currency: str = "USD"):
        return {"id": "ORDER-TEST-2", "status": "CREATED", "links": []}

    calls = {"capture": 0}

    async def fake_capture(order_id: str):
        calls["capture"] += 1
        return {"status": "COMPLETED", "purchase_units": [{"payments": {"captures": [{"id": "CAPTURE-TEST-1"}]}}]}

    monkeypatch.setattr(routes, "create_order", fake_create)
    monkeypatch.setattr(routes, "capture_order", fake_capture)

    assert client.post(f"/api/paypal/orders?decision_id={decision_id}").status_code == 200
    assert client.post("/api/paypal/orders/UNKNOWN/capture").status_code == 404

    captured = client.post("/api/paypal/orders/ORDER-TEST-2/capture")
    assert captured.status_code == 200
    assert captured.json()["paypal_capture_id"] == "CAPTURE-TEST-1"

    stored = database.get_proof(decision_id)
    assert stored["status"] == "completed"
    assert stored["paypal_capture_id"] == "CAPTURE-TEST-1"

    duplicate = client.post("/api/paypal/orders/ORDER-TEST-2/capture")
    assert duplicate.status_code == 409
    assert calls["capture"] == 1


def test_rejected_proof_can_never_create_an_order(database):
    proof = seed_proof(database)
    decision_id = proof["decision_id"]

    rejected = client.post(f"/api/decision-proofs/{decision_id}/reject")
    assert rejected.status_code == 200
    assert database.get_proof(decision_id)["status"] == "rejected"
    assert client.post(f"/api/paypal/orders?decision_id={decision_id}").status_code == 409
    assert client.post(f"/api/decision-proofs/{decision_id}/approve").status_code == 409


def test_proof_integrity_detects_tampering(database):
    proof = seed_proof(database)
    decision_id = proof["decision_id"]

    response = client.get(f"/api/decision-proofs/{decision_id}")
    assert response.status_code == 200
    assert response.json()["integrity_verified"] is True

    tampered = json.loads(json.dumps(proof))
    tampered["selected_products"][0]["price"] = "0.01"
    assert proof_hash(tampered) != proof["integrity_hash"]

    with database.engine.begin() as connection:
        connection.execute(
            text("UPDATE decision_proofs SET payload=:payload WHERE decision_id=:id"),
            {"payload": json.dumps(tampered), "id": decision_id},
        )

    assert client.get(f"/api/decision-proofs/{decision_id}").json()["integrity_verified"] is False
