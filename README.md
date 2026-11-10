# OmniBuy AI

**AI can decide what to buy. OmniBuy proves it should.**

OmniBuy is a verified autonomous commerce agent for the PayPal AI Hackathon. It
separates live product discovery, deterministic optimization, server-side policy
checks, explicit human approval, PayPal Sandbox payment, and auditability — so an
agent can prepare a purchase without ever being trusted to spend on its own.

```text
Intent → Channel3 discovery → Optimization → Policy Guard → Decision Proof
       → Human approval → PayPal Sandbox order → Server-side capture → Audit Ledger
```

Everything shown in the product is backed by the API. There are no mocked
products, no simulated payment success, and no UI-only controls.

## Verified end-to-end evidence

Recorded from a real Channel3 + PayPal Sandbox run on 2026-11-10.

| Scenario | Decision Proof | Result |
| --- | --- | --- |
| A. Successful purchase | `DEC-740479248D32` | Approved, PayPal order `5BF91167MC9125519`, capture `0KF06784HS030572L`, status `completed` |
| B. Policy violation | `DEC-01A2361E172B` | `blocked` — no compliant cart under $50; no PayPal order can be created |
| C. Re-optimization | `DEC-D73D90B5D1B8` (`lowest_cost`, $9.99) · `DEC-9DA789607206` (`best_value`, $57.65) · `DEC-61E1D6553AB0` (`highest_quality`, $57.65) | Objective changes produce different bundles |

The captured transaction is persisted with its capture ID and still verifies its
Decision Proof hash (`integrity_verified: true`). The buyer completed payment in
the PayPal Sandbox; `/checkout?token=...` then captured the order server-side.

## Architecture

```text
apps/web   Next.js 15 (App Router, React 19, TypeScript)
apps/api   FastAPI, Pydantic v2, SQLAlchemy + SQLite, LangGraph workflow
```

| Concern | Implementation |
| --- | --- |
| Discovery | `POST https://api.trychannel3.com/v1/search` with `x-api-key`; 20 live offers with prices, merchants, images, links and buyer ratings |
| Optimization | Deterministic combination search over decimal money; budgets, required categories, item ceiling, and three objectives: `lowest_cost`, `best_value`, `highest_quality` |
| Quality score | Bayesian-shrunk Channel3 buyer ratings: `(rating/5*100*count + 70*5) / (count+5)`; unrated products use the neutral prior `70` |
| Policy Guard | Persisted settings in SQLite, enforced server-side on every proposal and simulation, independent of the LLM |
| Decision Proof | Immutable fields + SHA-256 hash; API returns `integrity_verified` by recomputing the hash |
| Approval | Human approval is mandatory and cannot be disabled through the API (`human_approval_required: Literal[True]`) |
| Payments | PayPal Orders v2 with idempotent `PayPal-Request-Id`; order only after approval; capture verified against its proof |
| Audit | Append-only policy events plus proof lifecycle timestamps, order IDs and capture IDs |

### API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service and integration status |
| `GET` | `/api/discovery?query=...` | Live Channel3 products |
| `POST` | `/api/proposals` | Run workflow, return Decision Proof |
| `GET` | `/api/decision-proofs` | List proofs |
| `GET` | `/api/decision-proofs/{id}` | Full proof + integrity verification |
| `POST` | `/api/decision-proofs/{id}/approve` | Human approval |
| `POST` | `/api/decision-proofs/{id}/reject` | Reject and lock out payment |
| `POST` | `/api/paypal/orders?decision_id=...` | Create Sandbox order for an approved proof |
| `POST` | `/api/paypal/orders/{order_id}/capture` | Capture once, persist result |
| `GET/PUT` | `/api/policy` | Read/update persisted policy |
| `POST` | `/api/policy/reset` | Restore defaults |
| `POST` | `/api/policy/simulate` | Live policy evaluation |
| `GET` | `/api/policy/events` | Policy/audit event stream |

## Policy Guard behavior

Policy edits are persisted server-side and evaluated on the very next proposal.
The UI exposes only controls that change enforcement:

- Per-session cap (default `$900`) and monthly cap (default `$5,000`)
- Maximum single-item price (default `$600`)
- Merchant allowlist (empty list accepts every Channel3-verified merchant)
- Restricted categories (default: digital currencies, software subscriptions, weapons)
- USD-only settlement
- Mandatory human approval, locked ON

Checks enforced by the engine: `currency`, `non_empty_cart`, `budget_cap`,
`monthly_cap`, `max_item_price`, `required_categories`, `restricted_categories`,
`merchant_allowlist`, `human_approval`.

Any failed check produces a `blocked` proof. A blocked or rejected proof cannot
create a PayPal order. A proof that already has an order cannot create a second
one, and a capture can only happen once.

## Integrity model

`integrity_hash` is SHA-256 over the immutable decision fields: requirements,
selected products, alternatives, optimization totals, policy settings, facts,
uncertainties and creation time. `GET /api/decision-proofs/{id}` recomputes it.
Tampering with a stored price or total flips `integrity_verified` to `false`
(covered by a test). Older proofs created before hashing was introduced report
`false` by design.

## Run locally

```bash
cp .env.example .env.local          # fill CHANNEL3_API_KEY + PayPal Sandbox credentials
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

```bash
cd apps/web
cp .env.example .env.local          # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev -- --port 3000
```

Open `http://localhost:3000`. The API refuses to fake discovery when Channel3 is
not configured; it returns an explicit configuration error instead.

### Tests and type checks

```bash
.venv/bin/pytest -q                 # 16 passed
cd apps/web && npm run typecheck    # no errors
```

Coverage includes optimizer budget/category behavior, policy persistence and
reset, allowlist/category/cap enforcement, USD-only enforcement, proof integrity
tampering, mandatory approval, single-order and single-capture guards, rejection
lockout, policy API validation, and scenarios B and C.

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for the Render blueprint
(`render.yaml`), environment variables, persistent-disk layout, and verification
steps.

## Demo scenario guide

See [`docs/demo-scenarios.md`](docs/demo-scenarios.md) for the exact requests and
the recorded Decision Proof IDs.

## Limitations

- Prices and availability are a point-in-time Channel3 snapshot. Shipping, taxes
  and merchant fulfillment terms are confirmed at PayPal checkout.
- Connect-account onboarding happens inside PayPal checkout; OmniBuy does not
  perform merchant onboarding itself.
- PayPal is Sandbox-only in this build; no live credentials are used.
- Audit events are append-only within SQLite; there is no external timestamp
  authority or third-party notarization of proof hashes.
- The optimizer is exhaustive over at most 8 selected items, appropriate for
  single-purchase intents rather than bulk procurement.

## License

MIT — see [`LICENSE`](LICENSE).
