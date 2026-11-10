from decimal import Decimal

from app.persistence.db import DEFAULT_POLICY
from app.policies.engine import verify_policy
from app.schemas.products import OptimizationResult, Product, PurchaseRequest


def product(pid: str, category: str, price: str, merchant: str = "Verified Merchant", quality: int = 80) -> Product:
    return Product(id=pid, title=pid, merchant=merchant, price=Decimal(price), currency="USD", category=category, specifications={"quality_score": quality}, product_url="https://example.com/" + pid, availability="in_stock", source="test")


def result_of(products: list[Product]) -> OptimizationResult:
    total = sum((product.price for product in products), Decimal("0"))
    return OptimizationResult(selected=products, total=total, remaining_budget=Decimal("900") - total, quality_score=Decimal("80"), satisfied_categories=[], missing_categories=[], evaluated_candidates=len(products))


def test_policy_persistence_and_reset(database):
    custom = {**DEFAULT_POLICY, "budget_cap": 1234.0, "allowed_merchants": ["Dell Direct"], "restricted_categories": ["weapons", "gift cards"]}
    database.save_policy_settings(custom)

    stored = database.get_policy_settings()
    assert stored["budget_cap"] == 1234.0
    assert stored["allowed_merchants"] == ["Dell Direct"]
    assert stored["restricted_categories"] == ["weapons", "gift cards"]

    event = database.record_policy_event("policy_update", "passed", detail="test")
    assert database.list_policy_events(5)[0]["event_id"] == event["event_id"]
    assert database.policy_stats()["passed"] == 1

    database.reset_policy_settings()
    assert database.get_policy_settings()["budget_cap"] == DEFAULT_POLICY["budget_cap"]


def test_engine_enforces_persisted_allowlist_and_category_blocks(database):
    request = PurchaseRequest(request="buy a camera", budget=Decimal("500"))
    database.save_policy_settings({**DEFAULT_POLICY, "allowed_merchants": ["Dell Direct"], "restricted_categories": ["electronics"]})

    policy = verify_policy(request, result_of([product("camera", "electronics", "120", merchant="Amazon")]))
    assert policy.passed is False
    assert {check.name for check in policy.checks if not check.passed} >= {"merchant_allowlist", "restricted_categories"}


def test_engine_enforces_item_ceiling_and_session_cap(database):
    request = PurchaseRequest(request="buy a monitor", budget=Decimal("200"))
    database.save_policy_settings({**DEFAULT_POLICY, "max_item_price": 100.0, "budget_cap": 150.0})

    policy = verify_policy(request, result_of([product("monitor", "monitor", "180")]))
    failed = {check.name for check in policy.checks if not check.passed}
    assert "max_item_price" in failed
    assert "budget_cap" in failed


def test_engine_treats_usd_only_as_a_hard_check(database):
    request = PurchaseRequest(request="buy a monitor", budget=Decimal("200"))
    database.save_policy_settings({**DEFAULT_POLICY, "currency": "EUR"})

    policy = verify_policy(request, result_of([product("monitor", "monitor", "180")]))
    assert any(check.name == "currency" and not check.passed for check in policy.checks)
