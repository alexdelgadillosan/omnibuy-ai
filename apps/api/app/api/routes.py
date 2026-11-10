from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.integrations.channel3 import DiscoveryUnavailable, search_channel3
from app.agents.workflow import run_workflow
from app.policies.engine import verify_policy
from app.schemas.products import Product, PurchaseRequest
from app.services.proof import create_decision_proof
from app.persistence.db import approve_proof, get_proof, list_proofs, record_paypal_capture, record_paypal_order, reject_proof, save_proof
from app.integrations.paypal import PayPalError, capture_order, create_order

router = APIRouter(prefix="/api")


class ProposalInput(PurchaseRequest):
    candidates: list[Product] | None = Field(default=None, max_length=100)


class PolicySimulation(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "USD"
    category: str = "general"
    budget: float = Field(default=900, gt=0)
    max_item_price: float = Field(default=600, gt=0)


@router.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "omnibuy-ai", "payments": "paypal-sandbox", "discovery": "channel3"}


@router.post("/policy/simulate")
async def simulate_policy(request: PolicySimulation) -> dict:
    restricted = {"digital currencies", "software subscriptions", "weapons"}
    checks = [
        {"name": "budget_cap", "passed": request.amount <= request.budget, "detail": f"${request.amount:.2f} vs ${request.budget:.2f} session cap."},
        {"name": "single_item_ceiling", "passed": request.amount <= request.max_item_price, "detail": f"${request.amount:.2f} vs ${request.max_item_price:.2f} item ceiling."},
        {"name": "currency", "passed": request.currency.upper() == "USD", "detail": "USD-only settlement policy."},
        {"name": "restricted_category", "passed": request.category.lower() not in restricted, "detail": "Category is permitted." if request.category.lower() not in restricted else "Category is restricted."},
        {"name": "human_approval", "passed": False, "detail": "Human approval is mandatory before payment."},
    ]
    return {"passed": all(check["passed"] for check in checks[:-1]), "checks": checks, "status": "BLOCKED" if not all(check["passed"] for check in checks[:-1]) else "AWAITING_APPROVAL"}


@router.post("/proposals")
async def create_proposal(request: ProposalInput) -> dict:
    try:
        candidates = request.candidates if request.candidates is not None else await search_channel3(request.request, request.currency)
    except DiscoveryUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Product discovery failed: {error}") from error
    workflow = run_workflow(request, candidates)
    result = workflow["optimization"]
    policy = workflow["policy"]
    proof = create_decision_proof(request, result, policy)
    proof["workflow_events"] = workflow["events"]
    save_proof(proof)
    return {"proof": proof, "state": "AWAITING_APPROVAL" if policy.passed else "BLOCKED"}


@router.get("/discovery")
async def discovery(query: str = "popular products", currency: str = "USD") -> dict:
    try:
        products = await search_channel3(query, currency)
    except DiscoveryUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Product discovery failed: {error}") from error
    return {"query": query, "products": [product.model_dump(mode="json") for product in products], "count": len(products)}


@router.get("/decision-proofs/{decision_id}")
async def decision_proof(decision_id: str) -> dict:
    proof = get_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Decision Proof not found")
    return proof


@router.get("/decision-proofs")
async def decision_proofs() -> list[dict]:
    return list_proofs()


@router.post("/decision-proofs/{decision_id}/approve")
async def approve_decision(decision_id: str) -> dict:
    proof = approve_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=409, detail="Decision Proof is missing, blocked, or already processed")
    return {"decision_id": decision_id, "status": "approved", "approved_at": proof["approved_at"]}


@router.post("/decision-proofs/{decision_id}/reject")
async def reject_decision(decision_id: str) -> dict:
    proof = reject_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=409, detail="Decision Proof is missing, blocked, or already processed")
    return {"decision_id": decision_id, "status": "rejected", "rejected_at": proof["rejected_at"]}


@router.post("/paypal/orders")
async def paypal_order(decision_id: str) -> dict:
    proof = get_proof(decision_id)
    if not proof or proof.get("status") != "approved":
        raise HTTPException(status_code=409, detail="Human approval is required before creating a PayPal order")
    try:
        order = await create_order(decision_id, proof["optimization"]["total"], proof["requirements"]["currency"])
    except PayPalError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    order_id = order.get("id")
    if not order_id or not record_paypal_order(decision_id, order_id):
        raise HTTPException(status_code=500, detail="PayPal order was created but could not be persisted safely")
    return {"decision_id": decision_id, "paypal_order_id": order_id, "status": order.get("status"), "links": order.get("links", [])}


@router.post("/paypal/orders/{order_id}/capture")
async def paypal_capture(order_id: str) -> dict:
    try:
        result = await capture_order(order_id)
    except PayPalError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    if result.get("status") != "COMPLETED":
        raise HTTPException(status_code=502, detail="PayPal did not return a completed capture")
    captures = result.get("purchase_units", [])
    capture_id = captures[0].get("payments", {}).get("captures", [{}])[0].get("id") if captures else None
    if not capture_id or not record_paypal_capture(order_id, capture_id):
        raise HTTPException(status_code=500, detail="PayPal capture completed but could not be persisted safely")
    return {"paypal_order_id": order_id, "paypal_capture_id": capture_id, "status": result.get("status"), "capture": captures}
