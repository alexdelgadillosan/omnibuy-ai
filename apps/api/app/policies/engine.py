from decimal import Decimal
from pydantic import BaseModel
from app.schemas.products import OptimizationResult, Product, PurchaseRequest


class PolicyCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class PolicyResult(BaseModel):
    passed: bool
    checks: list[PolicyCheck]


def verify_policy(request: PurchaseRequest, result: OptimizationResult) -> PolicyResult:
    checks = [
        PolicyCheck(name="currency", passed=request.currency.upper() == "USD", detail="Checkout currency must be USD."),
        PolicyCheck(name="non_empty_cart", passed=bool(result.selected), detail="At least one verified product must be selected." if result.selected else "No compliant product combination was found."),
        PolicyCheck(name="budget_cap", passed=result.total <= request.budget, detail=f"${result.total:.2f} is within the ${request.budget:.2f} budget."),
        PolicyCheck(name="required_categories", passed=not result.missing_categories, detail="All required categories are represented." if not result.missing_categories else f"Missing: {', '.join(result.missing_categories)}."),
        PolicyCheck(name="restricted_categories", passed=all(p.category.lower() not in {x.lower() for x in request.restricted_categories} for p in result.selected), detail="No restricted categories selected."),
        PolicyCheck(name="merchant_allowlist", passed=not request.allowed_merchants or all(p.merchant in request.allowed_merchants for p in result.selected), detail="All selected merchants are allowed."),
        PolicyCheck(name="human_approval", passed=False, detail="Explicit human approval is required before payment."),
    ]
    return PolicyResult(passed=all(check.passed for check in checks if check.name != "human_approval"), checks=checks)
