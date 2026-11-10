from datetime import datetime, timezone
from uuid import uuid4
from app.policies.engine import PolicyResult
from app.schemas.products import OptimizationResult, PurchaseRequest


def create_decision_proof(request: PurchaseRequest, result: OptimizationResult, policy: PolicyResult) -> dict:
    return {
        "decision_id": f"DEC-{uuid4().hex[:12].upper()}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "awaiting_approval" if policy.passed else "blocked",
        "requirements": request.model_dump(mode="json"),
        "evaluated_candidates": result.evaluated_candidates,
        "selected_products": [p.model_dump(mode="json") for p in result.selected],
        "alternatives": [[p.model_dump(mode="json") for p in alt] for alt in result.alternatives],
        "optimization": {"objective": request.objective, "total": str(result.total), "remaining_budget": str(result.remaining_budget), "quality_score": str(result.quality_score)},
        "policy": policy.model_dump(mode="json"),
        "facts": ["Prices and availability came from the discovery source.", "Budget arithmetic was calculated deterministically.", "Payment has not been initiated."],
        "uncertainties": ["Shipping, taxes and final merchant fulfillment terms require checkout confirmation."],
    }
