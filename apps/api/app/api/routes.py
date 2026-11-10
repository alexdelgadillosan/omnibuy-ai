from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.integrations.channel3 import DiscoveryUnavailable, search_channel3
from app.optimization.engine import optimize
from app.policies.engine import verify_policy
from app.schemas.products import Product, PurchaseRequest
from app.services.proof import create_decision_proof
from app.persistence.db import approve_proof, get_proof, save_proof
from app.integrations.paypal import PayPalError, capture_order, create_order

router = APIRouter(prefix="/api")


class ProposalInput(PurchaseRequest):
    candidates: list[Product] | None = Field(default=None, max_length=100)


@router.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "omnibuy-ai", "payments": "paypal-sandbox", "discovery": "channel3"}


@router.post("/proposals")
async def create_proposal(request: ProposalInput) -> dict:
    try:
        candidates = request.candidates if request.candidates is not None else await search_channel3(request.request, request.currency)
    except DiscoveryUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Product discovery failed: {error}") from error
    result = optimize(request, candidates)
    policy = verify_policy(request, result)
    proof = create_decision_proof(request, result, policy)
    save_proof(proof)
    return {"proof": proof, "state": "AWAITING_APPROVAL" if policy.passed else "BLOCKED"}


@router.get("/decision-proofs/{decision_id}")
async def decision_proof(decision_id: str) -> dict:
    proof = get_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Decision Proof not found")
    return proof


@router.post("/decision-proofs/{decision_id}/approve")
async def approve_decision(decision_id: str) -> dict:
    proof = approve_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=409, detail="Decision Proof is missing, blocked, or already processed")
    return {"decision_id": decision_id, "status": "approved", "approved_at": proof["approved_at"]}


@router.post("/paypal/orders")
async def paypal_order(decision_id: str) -> dict:
    proof = get_proof(decision_id)
    if not proof or proof.get("status") != "approved":
        raise HTTPException(status_code=409, detail="Human approval is required before creating a PayPal order")
    try:
        order = await create_order(decision_id, proof["optimization"]["total"], proof["requirements"]["currency"])
    except PayPalError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"decision_id": decision_id, "paypal_order_id": order.get("id"), "status": order.get("status"), "links": order.get("links", [])}


@router.post("/paypal/orders/{order_id}/capture")
async def paypal_capture(order_id: str) -> dict:
    try:
        result = await capture_order(order_id)
    except PayPalError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    if result.get("status") != "COMPLETED":
        raise HTTPException(status_code=502, detail="PayPal did not return a completed capture")
    return {"paypal_order_id": order_id, "status": result.get("status"), "capture": result.get("purchase_units", [])}
