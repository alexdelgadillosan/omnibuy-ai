"""Decision Proof lifecycle: integrity, rejection and payment lockout."""
import json
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api import routes
from app.main import app
from app.persistence.db import DEFAULT_POLICY
from app.policies.engine import PolicyCheck, PolicyResult
from app.schemas.products import OptimizationResult, Product, PurchaseRequest
from app.services.proof import create_decision_proof

client = TestClient(app)


def make_proof(database, currency: str = "USD", total: str = "19.99") -> dict:
    request = PurchaseRequest(request="buy a gift", budget=Decimal("100"), currency=currency, objective="best_value")
    product = Product(
        id="gift-1",
        title="Verified gift",
        merchant="Gift Shop",
        price=Decimal(total),
        currency="USD",
        category="gifts",
        specifications={"quality_score": 85},
        product_url="https://example.com/gift",
        availability="in_stock",
        source="test",
    )
    result = OptimizationResult(
        selected=[product],
        total=Decimal(total),
        remaining_budget=Decimal("100") - Decimal(total),
        quality_score=Decimal("85"),
        satisfied_categories=["gifts"],
        missing_categories=[],
        evaluated_candidates=1,
    )
    # A fabricated passing policy isolates lifecycle logic from engine math.
    policy = PolicyResult(passed=True, checks=[PolicyCheck(name="human_approval", passed=False, detail="approval required")])
    proof = create_decision_proof(request, result, policy, {**DEFAULT_POLICY, "monthly_cap": 100000.0})
    proof["workflow_events"] = []
    database.save_proof(proof)
    return proof


def test_unknown_decision_proof_returns_404(database):
    response = client.get("/api/decision-proofs/DEC-DOES-NOT-EXIST")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_fresh_proof_verifies_and_tampering_flips_it(database):
    proof = make_proof(database)
    stored = client.get(f"/api/decision-proofs/{proof['decision_id']}").json()
    assert stored["integrity_verified"] is True

    tampered = {**stored, "optimization": {**stored["optimization"], "total": "999.99"}}
    with database.engine.begin() as connection:
        connection.execute(
            text("UPDATE decision_proofs SET payload=:payload WHERE decision_id=:id"),
            {"id": proof["decision_id"], "payload": json.dumps(tampered)},
        )
    response = client.get(f"/api/decision-proofs/{proof['decision_id']}").json()
    assert response["integrity_verified"] is False
    assert client.post(f"/api/decision-proofs/{proof['decision_id']}/approve").status_code == 409


def test_rejection_stamps_rejected_at_only_and_locks_everything(database):
    proof = make_proof(database)
    decision_id = proof["decision_id"]

    rejected = client.post(f"/api/decision-proofs/{decision_id}/reject")
    assert rejected.status_code == 200
    body = rejected.json()
    assert body["status"] == "rejected"
    assert body["rejected_at"]

    stored = client.get(f"/api/decision-proofs/{decision_id}").json()
    assert stored["status"] == "rejected"
    assert stored["approved_at"] is None

    assert client.post(f"/api/decision-proofs/{decision_id}/approve").status_code == 409
    assert client.post(f"/api/decision-proofs/{decision_id}/reject").status_code == 409
    assert client.post(f"/api/paypal/orders?decision_id={decision_id}").status_code == 409


def test_approval_is_single_use(database):
    proof = make_proof(database)
    decision_id = proof["decision_id"]

    first = client.post(f"/api/decision-proofs/{decision_id}/approve")
    assert first.status_code == 200
    assert first.json()["approved_at"]

    second = client.post(f"/api/decision-proofs/{decision_id}/approve")
    assert second.status_code == 409
    assert client.post(f"/api/decision-proofs/{decision_id}/reject").status_code == 409


def test_non_usd_proof_cannot_create_paypal_orders(database):
    proof = make_proof(database, currency="EUR")
    decision_id = proof["decision_id"]
    assert client.post(f"/api/decision-proofs/{decision_id}/approve").status_code == 200

    response = client.post(f"/api/paypal/orders?decision_id={decision_id}")
    assert response.status_code == 409
    assert "USD" in response.json()["detail"]


def test_capture_rejects_orders_not_awaiting_capture(database, monkeypatch):
    proof = make_proof(database)
    decision_id = proof["decision_id"]
    client.post(f"/api/decision-proofs/{decision_id}/approve")

    async def fake_create(decision_id: str, amount: str, currency: str = "USD"):
        return {"id": "ORDER-LIFE-1", "status": "CREATED", "links": []}

    async def fake_capture_mismatch(order_id: str):
        # A capture pointing at a different decision is never persisted.
        return {"status": "COMPLETED", "purchase_units": [{"reference_id": "DEC-OTHER", "custom_id": "DEC-OTHER", "payments": {"captures": [{"id": "CAP-OTHER", "status": "COMPLETED", "amount": {"currency_code": "USD", "value": "19.99"}}]}}]}

    monkeypatch.setattr(routes, "create_order", fake_create)
    monkeypatch.setattr(routes, "capture_order", fake_capture_mismatch)
    assert client.post(f"/api/paypal/orders?decision_id={decision_id}").status_code == 200

    mismatch = client.post("/api/paypal/orders/ORDER-LIFE-1/capture")
    assert mismatch.status_code == 502
    assert "does not match" in mismatch.json()["detail"]

    stored = client.get(f"/api/decision-proofs/{decision_id}").json()
    assert stored["status"] == "checkout_pending"

    # Capture before any order exists for that id.
    missing = client.post("/api/paypal/orders/ORDER-NEVER-CREATED/capture")
    assert missing.status_code == 404
