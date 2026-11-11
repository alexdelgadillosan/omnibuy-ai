"""LLM-assisted intent parsing with a fail-safe fallback contract.

`parse_intent_with_llm` never invents data and never raises: it returns a dict
of extracted fields, or an empty dict when the LLM is not configured, the call
fails, or the output is unusable. Currency is deliberately NOT extracted —
USD-only settlement is a server-side invariant.
"""
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import get_settings

OBJECTIVES = {"lowest_cost", "best_value", "highest_quality"}
MAX_BUDGET = Decimal("100000")  # mirrors PurchaseRequest validation

SYSTEM_PROMPT = """You extract a structured purchase intent from a shopping request written in natural language.
Return ONLY a JSON object. Extract only what the text explicitly states; use null when absent:
{
  "budget": positive number — the maximum TOTAL spend of the purchase (e.g. 30 for "under $30", "for less than 30 dollars", "with a 50 dollar budget") or null,
  "max_price_per_item": positive number or null — ONLY when the text states a separate per-item limit distinct from the total,
  "objective": "lowest_cost" | "best_value" | "highest_quality" or null (e.g. "cheapest"/"lowest price" → lowest_cost; "best quality"/"premium" → highest_quality) or null,
  "allowed_merchants": array of merchant domains or store names the user restricted the purchase to (e.g. ["amazon.com"]) or []
}
Rules: never invent a budget or merchant that the text does not state. Do not extract product categories. Ignore currencies other than USD."""


def _clean_terms(values: Any, limit: int) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        term = value.strip()
        if term and term.lower() not in [existing.lower() for existing in cleaned]:
            cleaned.append(term[:120])
        if len(cleaned) >= limit:
            break
    return cleaned


def _decimal(value: Any) -> str | None:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if amount <= 0 or amount > MAX_BUDGET:
        return None
    return format(amount.normalize(), "f")


def _strip_code_fence(content: str) -> str:
    match = re.search(r"\{.*\}", content, re.DOTALL)
    return match.group(0) if match else content


def normalize_intent(payload: Any) -> dict:
    """Validate and normalize raw LLM output into PurchaseRequest-compatible fields."""
    if not isinstance(payload, dict):
        return {}
    fields: dict = {}
    if (budget := _decimal(payload.get("budget"))) is not None:
        fields["budget"] = budget
    if (item_cap := _decimal(payload.get("max_price_per_item"))) is not None:
        fields["max_price_per_item"] = item_cap
    if payload.get("objective") in OBJECTIVES:
        fields["objective"] = payload["objective"]
    if (categories := _clean_terms(payload.get("required_categories"), 20)):
        fields["required_categories"] = [term.lower() for term in categories]
    if (merchants := _clean_terms(payload.get("allowed_merchants"), 50)):
        fields["allowed_merchants"] = merchants
    return fields


async def parse_intent_with_llm(text: str) -> dict:
    settings = get_settings()
    if not settings.llm_api_key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}", "Content-Type": "application/json"},
                json={
                    "model": settings.llm_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        return normalize_intent(json.loads(_strip_code_fence(content)))
    except Exception:
        return {}
