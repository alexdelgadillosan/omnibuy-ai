from decimal import Decimal
from itertools import combinations
from app.schemas.products import OptimizationResult, Product, PurchaseRequest


def optimize(request: PurchaseRequest, candidates: list[Product]) -> OptimizationResult:
    usable = [p for p in candidates if p.availability == "in_stock" and p.currency.upper() == request.currency.upper() and (not request.max_price_per_item or p.price <= request.max_price_per_item)]
    required = {category.lower() for category in request.required_categories}
    ranked: list[tuple[Decimal, tuple[Product, ...]]] = []
    for size in range(1, min(len(usable), 8) + 1):
        for combo in combinations(usable, size):
            total = sum((p.price for p in combo), Decimal("0"))
            categories = {p.category.lower() for p in combo}
            if total <= request.budget and required.issubset(categories):
                quality = sum((Decimal(str(p.specifications.get("quality_score", 70))) for p in combo), Decimal("0")) / size
                if request.objective == "lowest_cost": score = -total
                elif request.objective == "highest_quality": score = quality
                else: score = quality * Decimal("2") - total / max(request.budget, Decimal("1")) * Decimal("100")
                ranked.append((score, combo))
    ranked.sort(key=lambda item: item[0], reverse=True)
    selected = list(ranked[0][1]) if ranked else []
    total = sum((p.price for p in selected), Decimal("0"))
    categories = {p.category.lower() for p in selected}
    return OptimizationResult(selected=selected, alternatives=[list(x[1]) for x in ranked[1:3]], total=total, remaining_budget=request.budget-total, quality_score=(sum((Decimal(str(p.specifications.get("quality_score", 70))) for p in selected), Decimal("0")) / len(selected) if selected else Decimal("0")), satisfied_categories=sorted(categories & required), missing_categories=sorted(required - categories), evaluated_candidates=len(usable))
