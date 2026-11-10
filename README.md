# OmniBuy AI

**AI can decide what to buy. OmniBuy proves it should.**

OmniBuy is a verified autonomous commerce MVP for the PayPal AI Hackathon. It separates discovery, deterministic optimization, server-side policy checks, explicit human approval, PayPal Sandbox payment, and auditability.

## Run locally

```bash
cp .env.example .env.local
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

In another terminal:

```bash
cd apps/web
npm install
npm run dev
```

The API intentionally returns a clear configuration error until the official Channel3 API base URL and key are configured. It never substitutes fake live products.

## Workflow

```text
Intent → Discovery → Optimization → Policy Guard → Decision Proof → Approval → PayPal Sandbox → Audit
```

The optimizer uses integer/decimal-safe money calculations and the policy engine is independent of the LLM. Product descriptions are untrusted input and cannot override policies.
