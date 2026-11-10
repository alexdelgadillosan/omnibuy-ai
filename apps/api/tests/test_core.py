from decimal import Decimal
from app.optimization.engine import optimize
from app.policies.engine import verify_policy
from app.schemas.products import Product, PurchaseRequest


def product(pid: str, category: str, price: str, quality: int = 80) -> Product:
    return Product(id=pid, title=pid, merchant="Verified Merchant", price=Decimal(price), currency="USD", category=category, specifications={"quality_score": quality}, product_url="https://example.com/" + pid, availability="in_stock", source="test")


def test_optimizer_stays_within_budget_and_covers_categories():
    request = PurchaseRequest(request="office", budget=Decimal("900"), required_categories=["chair", "keyboard"])
    result = optimize(request, [product("chair", "chair", "500"), product("keyboard", "keyboard", "100"), product("expensive", "chair", "950")])
    assert result.total == Decimal("600")
    assert not result.missing_categories
    assert verify_policy(request, result).passed is True


def test_policy_blocks_budget_violation_even_if_result_is_malformed():
    request = PurchaseRequest(request="office", budget=Decimal("900"), required_categories=[])
    result = optimize(request, [product("chair", "chair", "950")])
    assert result.selected == []
    policy = verify_policy(request, result)
    assert policy.passed is False
    assert any(check.name == "non_empty_cart" and not check.passed for check in policy.checks)


def test_policy_requires_approval():
    request = PurchaseRequest(request="office", budget=Decimal("900"))
    result = optimize(request, [product("chair", "chair", "100")])
    policy = verify_policy(request, result)
    assert any(check.name == "human_approval" and not check.passed for check in policy.checks)
