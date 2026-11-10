from decimal import Decimal
from pydantic import BaseModel
from app.persistence.db import get_policy_settings, policy_stats
from app.schemas.products import OptimizationResult, PurchaseRequest


class PolicyCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class PolicyResult(BaseModel):
    passed: bool
    checks: list[PolicyCheck]


def verify_policy(request: PurchaseRequest, result: OptimizationResult, settings: dict | None = None) -> PolicyResult:
    rules = settings or get_policy_settings()
    session_cap = min(Decimal(str(request.budget)), Decimal(str(rules.get("budget_cap", 900))))
    item_cap = Decimal(str(rules.get("max_item_price", 600)))
    if request.max_price_per_item:
        item_cap = min(item_cap, Decimal(str(request.max_price_per_item)))
    allowlist = {name.strip().lower() for name in (rules.get("allowed_merchants") or []) if str(name).strip()}
    allowlist |= {name.strip().lower() for name in request.allowed_merchants if str(name).strip()}
    restricted = {str(item).strip().lower() for item in (rules.get("restricted_categories") or [])}
    restricted |= {str(item).strip().lower() for item in request.restricted_categories}
    currency_ok = request.currency.upper() == "USD" and str(rules.get("currency", "USD")).upper() == "USD"
    oversize = [product for product in result.selected if product.price > item_cap]
    restricted_hits = [product for product in result.selected if product.category.strip().lower() in restricted]
    merchant_hits = [product for product in result.selected if allowlist and product.merchant.strip().lower() not in allowlist]
    committed = Decimal(str(policy_stats()["monthly_committed"]))
    monthly_cap = Decimal(str(rules.get("monthly_cap", 5000)))
    checks = [
        PolicyCheck(name="currency", passed=currency_ok, detail="USD-only settlement policy is enforced." if currency_ok else "Checkout currency must match the USD-only policy."),
        PolicyCheck(name="non_empty_cart", passed=bool(result.selected), detail="At least one verified product must be selected." if result.selected else "No compliant product combination was found."),
        PolicyCheck(name="budget_cap", passed=result.total <= session_cap, detail=f"${result.total:.2f} is within the active ${session_cap:.2f} session cap."),
        PolicyCheck(name="monthly_cap", passed=committed + result.total <= monthly_cap, detail=f"${committed + result.total:.2f} committed this month against the ${monthly_cap:.2f} monthly cap."),
        PolicyCheck(name="max_item_price", passed=not oversize, detail="Every item is below the per-item ceiling." if not oversize else f"{len(oversize)} item(s) exceed the ${item_cap:.2f} ceiling."),
        PolicyCheck(name="required_categories", passed=not result.missing_categories, detail="All required categories are represented." if not result.missing_categories else f"Missing: {', '.join(result.missing_categories)}."),
        PolicyCheck(name="restricted_categories", passed=not restricted_hits, detail="No restricted categories selected." if not restricted_hits else f"Restricted: {', '.join(p.category for p in restricted_hits)}."),
        PolicyCheck(name="merchant_allowlist", passed=not merchant_hits, detail="All selected merchants are on the allowlist." if not merchant_hits else f"Blocked merchant(s): {', '.join(p.merchant for p in merchant_hits)}."),
        PolicyCheck(name="human_approval", passed=False, detail="Explicit human approval is required before payment."),
    ]
    return PolicyResult(passed=all(check.passed for check in checks if check.name != "human_approval"), checks=checks)
