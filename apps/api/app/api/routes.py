from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from app.integrations.channel3 import DiscoveryUnavailable, search_channel3
from app.agents.workflow import run_workflow
from app.policies.engine import verify_policy
from app.schemas.products import Product, PurchaseRequest
from app.services.proof import create_decision_proof, proof_hash
from app.persistence.db import (
    DEFAULT_POLICY,
    approve_proof,
    get_policy_settings,
    get_proof,
    get_proof_by_order_id,
    list_policy_events,
    list_proofs,
    policy_stats,
    record_paypal_capture,
    record_paypal_order,
    record_policy_event,
    reject_proof,
    reset_policy_settings,
    save_policy_settings,
    save_proof,
)
from app.integrations.paypal import PayPalError, capture_order, create_order

router = APIRouter(prefix="/api")


class ProposalInput(PurchaseRequest):
    candidates: list[Product] | None = Field(default=None, max_length=100)


class PolicySimulation(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "USD"
    category: str = "general"
    merchant: str = ""


class PolicySettingsInput(BaseModel):
    budget_cap: float = Field(gt=0, le=100000)
    monthly_cap: float = Field(gt=0, le=1000000)
    max_item_price: float = Field(gt=0, le=100000)
    currency: Literal["USD"] = "USD"
    allowed_merchants: list[str] = Field(default_factory=list, max_length=100)
    restricted_categories: list[str] = Field(default_factory=list, max_length=100)
    human_approval_required: Literal[True] = True
    approval_threshold: float = Field(ge=0, le=100000)
    us_only: bool = True

    @field_validator("allowed_merchants", "restricted_categories")
    @classmethod
    def clean_terms(cls, values: list[str]) -> list[str]:
        cleaned = []
        for value in values:
            term = str(value).strip()
            if term and term.lower() not in {item.lower() for item in cleaned}:
                cleaned.append(term)
        return cleaned


@router.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "omnibuy-ai", "payments": "paypal-sandbox", "discovery": "channel3"}


@router.get("/policy")
async def read_policy() -> dict:
    return {"settings": get_policy_settings(), "stats": policy_stats(), "events": list_policy_events(20), "defaults": dict(DEFAULT_POLICY)}


@router.put("/policy")
async def update_policy(settings: PolicySettingsInput) -> dict:
    payload = settings.model_dump()
    save_policy_settings(payload)
    record_policy_event("policy_update", "passed", detail="Policy matrix updated by human operator.", context="Policy Guard")
    return {"settings": get_policy_settings(), "stats": policy_stats(), "events": list_policy_events(20)}


@router.post("/policy/reset")
async def reset_policy() -> dict:
    reset_policy_settings()
    record_policy_event("policy_reset", "passed", detail="Policy matrix restored to defaults.", context="Policy Guard")
    return {"settings": get_policy_settings(), "stats": policy_stats(), "events": list_policy_events(20)}


@router.get("/policy/events")
async def policy_events(limit: int = 20) -> list[dict]:
    return list_policy_events(max(1, min(limit, 100)))


@router.post("/policy/simulate")
async def simulate_policy(request: PolicySimulation) -> dict:
    settings = get_policy_settings()
    restricted = {str(item).strip().lower() for item in settings.get("restricted_categories", [])}
    allowlist = {str(item).strip().lower() for item in settings.get("allowed_merchants", []) if str(item).strip()}
    merchant = request.merchant.strip()
    checks = [
        {"name": "budget_cap", "passed": request.amount <= float(settings["budget_cap"]), "detail": f"${request.amount:.2f} vs ${float(settings['budget_cap']):.2f} session cap."},
        {"name": "max_item_price", "passed": request.amount <= float(settings["max_item_price"]), "detail": f"${request.amount:.2f} vs ${float(settings['max_item_price']):.2f} item ceiling."},
        {"name": "currency", "passed": request.currency.upper() == "USD" and settings.get("currency") == "USD", "detail": "USD-only settlement policy."},
        {"name": "restricted_category", "passed": request.category.strip().lower() not in restricted, "detail": "Category is permitted." if request.category.strip().lower() not in restricted else f"{request.category} is a restricted category."},
        {"name": "merchant_allowlist", "passed": not allowlist or not merchant or merchant.lower() in allowlist, "detail": "Merchant is permitted." if (not allowlist or not merchant or merchant.lower() in allowlist) else f"{merchant} is not on the merchant allowlist."},
        {"name": "human_approval", "passed": False, "detail": "Human approval remains mandatory before payment."},
    ]
    passed = all(check["passed"] for check in checks if check["name"] != "human_approval")
    status = "AWAITING_APPROVAL" if passed else "BLOCKED"
    detail = "; ".join(check["detail"] for check in checks if not check["passed"] and check["name"] != "human_approval") or "All deterministic checks passed."
    record_policy_event("simulation", "awaiting_approval" if passed else "blocked", amount=request.amount, detail=detail, context=f"{request.category} / {merchant or 'any merchant'}")
    return {"passed": passed, "status": status, "checks": checks, "settings": settings}


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
    proof = create_decision_proof(request, result, policy, get_policy_settings())
    proof["workflow_events"] = workflow["events"]
    save_proof(proof)
    record_policy_event(
        "proposal",
        "awaiting_approval" if policy.passed else "blocked",
        amount=float(result.total),
        detail="Proposal passed the deterministic policy matrix." if policy.passed else "; ".join(check.detail for check in policy.checks if not check.passed),
        context=request.request[:160],
    )
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
    proof["integrity_verified"] = bool(proof.get("integrity_hash")) and proof_hash(proof) == proof["integrity_hash"]
    return proof


@router.get("/decision-proofs")
async def decision_proofs() -> list[dict]:
    proofs = list_proofs()
    for proof in proofs:
        proof["integrity_verified"] = bool(proof.get("integrity_hash")) and proof_hash(proof) == proof["integrity_hash"]
    return proofs


@router.post("/decision-proofs/{decision_id}/approve")
async def approve_decision(decision_id: str) -> dict:
    proof = approve_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=409, detail="Decision Proof is missing, blocked, or already processed")
    record_policy_event("approval", "approved", amount=float(proof["optimization"]["total"]), detail="Human supervisor approved the Decision Proof.", context=decision_id)
    return {"decision_id": decision_id, "status": "approved", "approved_at": proof["approved_at"]}


@router.post("/decision-proofs/{decision_id}/reject")
async def reject_decision(decision_id: str) -> dict:
    proof = reject_proof(decision_id)
    if not proof:
        raise HTTPException(status_code=409, detail="Decision Proof is missing, blocked, or already processed")
    record_policy_event("rejection", "rejected", amount=float(proof["optimization"]["total"]), detail="Human supervisor rejected the Decision Proof.", context=decision_id)
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
    record_policy_event("paypal_order", "checkout_pending", amount=float(proof["optimization"]["total"]), detail=f"PayPal order {order_id} created after human approval.", context=decision_id)
    return {"decision_id": decision_id, "paypal_order_id": order_id, "status": order.get("status"), "links": order.get("links", [])}


@router.post("/paypal/orders/{order_id}/capture")
async def paypal_capture(order_id: str) -> dict:
    existing = get_proof_by_order_id(order_id)
    if not existing:
        raise HTTPException(status_code=404, detail="PayPal order is not linked to any Decision Proof")
    if existing.get("status") != "checkout_pending":
        raise HTTPException(status_code=409, detail="PayPal order is not awaiting capture")
    try:
        result = await capture_order(order_id)
    except PayPalError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    if result.get("status") != "COMPLETED":
        raise HTTPException(status_code=502, detail="PayPal did not return a completed capture")
    captures = result.get("purchase_units", [])
    capture_id = captures[0].get("payments", {}).get("captures", [{}])[0].get("id") if captures else None
    captured = record_paypal_capture(order_id, capture_id)
    if not capture_id or not captured:
        raise HTTPException(status_code=409, detail="PayPal order is unknown or is not awaiting capture")
    record_policy_event("paypal_capture", "completed", amount=float(captured["optimization"]["total"]), detail=f"PayPal capture {capture_id} completed and persisted.", context=captured["decision_id"])
    return {"paypal_order_id": order_id, "paypal_capture_id": capture_id, "status": result.get("status"), "capture": captures}
