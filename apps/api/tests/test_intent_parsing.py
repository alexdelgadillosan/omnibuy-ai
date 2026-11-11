"""LLM-assisted intent parsing: normalization units and route-level merge rules."""
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.persistence.db import DEFAULT_POLICY
from app.services.intent import normalize_intent, parse_intent_with_llm

client = TestClient(app)


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeLLMClient:
    calls: list = []
    responses: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exception):
        return False

    async def post(self, url, **kwargs):
        type(self).calls.append((url, kwargs))
        return type(self).responses.pop(0)


def llm_message(content) -> FakeResponse:
    return FakeResponse({"choices": [{"message": {"content": content}}]})


def configure_llm(monkeypatch, *, api_key: str = "key"):
    import app.services.intent as intent

    FakeLLMClient.calls = []
    FakeLLMClient.responses = []
    monkeypatch.setattr(intent, "get_settings", lambda: SimpleNamespace(
        llm_api_key=api_key,
        llm_base_url="https://llm.test/v1",
        llm_model="test-model",
    ))
    monkeypatch.setattr(intent.httpx, "AsyncClient", FakeLLMClient)
    return FakeLLMClient


def candidate(pid: str, price: str) -> dict:
    return {
        "id": pid, "title": pid, "merchant": "Amazon", "price": price, "currency": "USD",
        "category": "cables", "specifications": {"quality_score": 80},
        "product_url": f"https://example.com/{pid}", "availability": "in_stock", "source": "test",
    }


# --- Normalization units -----------------------------------------------------


def test_normalize_intent_maps_valid_fields():
    fields = normalize_intent({"budget": 30, "objective": "lowest_cost", "required_categories": ["Cables", " cables ", ""], "allowed_merchants": ["Amazon.com"]})
    assert fields == {"budget": "30", "objective": "lowest_cost", "required_categories": ["cables"], "allowed_merchants": ["Amazon.com"]}


def test_normalize_intent_drops_invalid_and_invented_values():
    fields = normalize_intent({
        "budget": -5, "max_price_per_item": "not-a-number", "objective": "make_it_rain",
        "required_categories": "office", "allowed_merchants": [42],
    })
    assert fields == {}


def test_normalize_intent_never_takes_currency_from_the_llm():
    fields = normalize_intent({"budget": 10, "currency": "EUR"})
    assert "currency" not in fields


def test_normalize_intent_ignores_non_dict_payloads():
    assert normalize_intent(None) == {}
    assert normalize_intent("budget=30") == {}
    assert normalize_intent([{"budget": 10}]) == {}


# --- parse_intent_with_llm fail-safe contract --------------------------------


def test_parser_returns_empty_without_any_http_call_when_not_configured(monkeypatch):
    fake = configure_llm(monkeypatch, api_key="")
    assert parse_intent_with_llm_sync() == {}
    assert fake.calls == []


def parse_intent_with_llm_sync() -> dict:
    import asyncio

    return asyncio.run(parse_intent_with_llm("buy a cable under $30"))


def test_parser_extracts_fields_from_json_content(monkeypatch):
    fake = configure_llm(monkeypatch)
    fake.responses.append(llm_message('{"budget": 30, "allowed_merchants": ["amazon.com"], "required_categories": ["cables"]}'))
    fields = parse_intent_with_llm_sync()
    assert fields["budget"] == "30"
    assert fields["allowed_merchants"] == ["amazon.com"]
    url, kwargs = fake.calls[0]
    assert url.endswith("/chat/completions")
    assert kwargs["json"]["model"] == "test-model"
    assert kwargs["json"]["response_format"] == {"type": "json_object"}


def test_parser_survives_fenced_and_prose_responses(monkeypatch):
    fake = configure_llm(monkeypatch)
    fake.responses.append(llm_message('Sure! Here is the intent:\n```json\n{"budget": 12.5}\n```\nHope that helps.'))
    assert parse_intent_with_llm_sync() == {"budget": "12.5"}


def test_parser_returns_empty_on_http_and_parse_failures(monkeypatch):
    fake = configure_llm(monkeypatch)
    fake.responses.append(FakeResponse({}, status_code=500))
    assert parse_intent_with_llm_sync() == {}

    fake.responses.append(llm_message("this is not json at all"))
    assert parse_intent_with_llm_sync() == {}


# --- Route-level merge rules -------------------------------------------------


def test_proposal_falls_back_to_policy_cap_when_no_llm_and_no_budget(database, monkeypatch):
    async def no_llm(text):
        return {}

    monkeypatch.setattr(routes, "parse_intent_with_llm", no_llm)
    response = client.post("/api/proposals", json={"request": "buy a cable", "candidates": [candidate("c-1", "19.99")]})
    assert response.status_code == 200
    proof = response.json()["proof"]
    assert Decimal_like(proof["requirements"]["budget"]) == DEFAULT_POLICY["budget_cap"]
    event = next(event for event in proof["workflow_events"] if event["type"] == "intent_parsed")
    assert event["source"] == "fallback"


def Decimal_like(value) -> float:
    return float(value)


def test_proposal_uses_llm_fields_only_for_unset_values(database, monkeypatch):
    async def fake_parse(text):
        return {"budget": "25", "allowed_merchants": ["amazon.com"], "objective": "lowest_cost"}

    monkeypatch.setattr(routes, "parse_intent_with_llm", fake_parse)
    # Client explicitly sends objective, so the LLM objective must NOT win.
    response = client.post("/api/proposals", json={"request": "cable from amazon under $25", "objective": "best_value", "candidates": [candidate("c-1", "19.99")]})
    proof = response.json()["proof"]
    assert Decimal_like(proof["requirements"]["budget"]) == 25.0
    assert proof["requirements"]["allowed_merchants"] == ["amazon.com"]
    assert proof["requirements"]["objective"] == "best_value"
    event = next(event for event in proof["workflow_events"] if event["type"] == "intent_parsed")
    assert event["source"] == "llm"
    assert "budget" in event["extracted"]


def test_llm_extracted_merchant_narrows_policy_and_can_block(database, monkeypatch):
    async def fake_parse(text):
        return {"budget": "5", "allowed_merchants": ["unobtainium.shop"]}

    monkeypatch.setattr(routes, "parse_intent_with_llm", fake_parse)
    response = client.post("/api/proposals", json={"request": "cable", "candidates": [candidate("c-1", "19.99")]})
    body = response.json()
    assert body["state"] == "BLOCKED"


def test_llm_can_never_change_currency_or_create_invalid_requests(database, monkeypatch):
    async def fake_parse(text):
        return {"currency": "EUR", "budget": "abc"}

    monkeypatch.setattr(routes, "parse_intent_with_llm", fake_parse)
    response = client.post("/api/proposals", json={"request": "cable", "candidates": [candidate("c-1", "19.99")]})
    assert response.status_code == 200
    proof = response.json()["proof"]
    assert proof["requirements"]["currency"] == "USD"
    assert Decimal_like(proof["requirements"]["budget"]) == DEFAULT_POLICY["budget_cap"]


def test_explicit_budget_always_wins_over_the_llm(database, monkeypatch):
    async def fake_parse(text):
        return {"budget": "25"}

    monkeypatch.setattr(routes, "parse_intent_with_llm", fake_parse)
    response = client.post("/api/proposals", json={"request": "cable", "budget": 60, "candidates": [candidate("c-1", "19.99")]})
    proof = response.json()["proof"]
    assert Decimal_like(proof["requirements"]["budget"]) == 60.0
    event = next(event for event in proof["workflow_events"] if event["type"] == "intent_parsed")
    assert event["source"] == "explicit"


def test_llm_failure_keeps_the_proposal_flow_working(database, monkeypatch):
    async def explode(text):
        raise RuntimeError("LLM down")

    monkeypatch.setattr(routes, "parse_intent_with_llm", explode)
    response = client.post("/api/proposals", json={"request": "cable", "budget": 50, "candidates": [candidate("c-1", "19.99")]})
    assert response.status_code == 200
    assert response.json()["state"] == "AWAITING_APPROVAL"
