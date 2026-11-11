# Devpost submission draft

Do not publish until the deployed URL and demo video URL exist.

## Project name

OmniBuy AI

## Tagline

AI can decide what to buy. OmniBuy proves it should.

## Inspiration

Agentic shopping demos usually stop at a chat answer or a fake "purchase
complete" screen. Real commerce needs deterministic math, enforceable spending
limits, an approval boundary, and a payment record that reconciles. We wanted to
build the missing trust layer: an agent that can prepare a purchase while a human
and an independent policy engine keep control of the money.

## What it does

OmniBuy AI turns a natural-language request into a verified purchase:

1. **Discovers** up to 20 live offers from Channel3 with prices, merchants,
   images, links and buyer ratings.
2. **Optimizes** deterministically with decimal money across three objectives:
   lowest cost, best value, highest quality. Quality uses Bayesian-shrunk Channel3
   buyer ratings rather than invented scores.
3. **Enforces Policy Guard** server-side: session and monthly caps, per-item
   ceiling, merchant allowlist, restricted categories, USD-only settlement, and
   mandatory human approval.
4. **Emits a Decision Proof** containing requirements, candidates, selected
   products, alternatives, totals, every policy check, facts, uncertainties, and
   a SHA-256 integrity hash recomputed on read.
5. **Requires explicit human approval.** A blocked or rejected proof can never
   create a PayPal order, and orders/captures are single-use.
6. **Settles through PayPal Orders v2** in Sandbox. The server creates the order
   with an idempotency key after approval, captures it server-side on return, and
   persists the order and capture IDs.
7. **Reconciles in the Audit Ledger**, including the full policy event stream.

## How we built it

- **Web:** Next.js 15 App Router, React 19, TypeScript. A single Stitch-derived
  dark interface with a responsive slide-over drawer at phone widths.
- **API:** FastAPI, Pydantic v2, SQLAlchemy + SQLite, LangGraph workflow
  orchestration.
- **Discovery:** Channel3 `POST /v1/search` with `x-api-key`.
- **Payments:** PayPal Orders v2 with OAuth, `PayPal-Request-Id` idempotency, and
  server-side capture.
- **Safety:** the optimizer and policy engine are deterministic and independent of
  the LLM. Product text is treated as untrusted input.
- **Tests:** 82 tests, all passing — 61 pytest backend tests (policy
  persistence/enforcement, proof tampering, approval lockout, duplicate order
  prevention, single-capture semantics, capture-mismatch rejection, USD
  double-gating, route surfaces, PayPal/Channel3 integration units, LLM intent
  parsing with fail-safe fallback, workflow events, scenarios B/C) plus a
  21-test Vitest + Testing Library suite for the frontend (format helpers,
  navigation, search handoff, theme persistence, and the Decision Proofs
  page).
- **Intent parsing:** an OpenAI-compatible LLM extracts budget, objective and
  merchant restrictions from free-text requests server-side, with a fail-safe
  fallback to the persisted policy cap; extracted fields are recorded on the
  Decision Proof and explicit client values always win.

## Real evidence

- Successful purchase: Decision Proof `DEC-740479248D32`, PayPal order
  `5BF91167MC9125519`, capture `0KF06784HS030572L`, status `completed`,
  `integrity_verified: true`.
- Policy block: `DEC-01A2361E172B` (`blocked`, no compliant cart under $50).
- Re-optimization: `DEC-D73D90B5D1B8` ($9.99 lowest cost) versus
  `DEC-9DA789607206` ($57.65 best value) and `DEC-61E1D6553AB0` ($57.65 highest
  quality).

## Challenges

- Keeping the agent's output auditable without letting an LLM make the final
  spending decision.
- Making policy edits take effect on the very next proposal while keeping the UI
  honest: we removed controls that persisted state but did not change enforcement.
- Handling PayPal's asynchronous buyer return safely: order ownership checks and
  a single allowed capture transition.
- Making different objectives produce genuinely different bundles, which required
  using real Channel3 ratings instead of a constant quality score.

## Accomplishments

- A full, real end-to-end Sandbox transaction with a persisted, verifiable proof.
- Policy Guard that blocks before payment and records every evaluation.
- Integrity verification that detects stored-proof tampering.
- A responsive interface where every visible control changes real behavior.

## What we learned

Deterministic boundaries are a product feature, not an implementation detail.
Approval, idempotency, and proof integrity are what make agentic commerce
reviewable by a finance team rather than a demo gimmick.

## What's next

- Merchant-side fulfillment and shipping reconciliation.
- Postgres plus append-only external audit storage.
- Multi-item procurement policies and team budgets.
- Live PayPal launch after additional compliance review.

## Built with

`next.js`, `react`, `typescript`, `fastapi`, `pydantic`, `sqlalchemy`, `sqlite`,
`langgraph`, `channel3`, `paypal-orders-v2`, `pytest`

## Links

- GitHub: https://github.com/alexdelgadillosan/omnibuy-ai
- Live app: _add after deployment_
- Demo video: _add after recording_
