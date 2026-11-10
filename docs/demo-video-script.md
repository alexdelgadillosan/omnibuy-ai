# Demo video script (under 3:00)

Target length: **2:45**. Record at 1440×900, browser zoom 100%, no personal tabs
visible. Keep the cursor deliberate; do not cut away from real API responses.

## 0:00–0:15 — Hook

**Screen:** Command Center.

**Voice-over:** "Autonomous agents can already find the best product. The hard
part is trusting them with money. OmniBuy AI lets an agent decide — but proves
every decision, enforces policy server-side, and requires a human before PayPal
is ever called."

## 0:15–0:35 — Problem framing

**Screen:** Scroll the pipeline panel and metrics.

**Voice-over:** "A chat response is not a purchase order. You need live discovery,
deterministic math, a policy gate, an auditable proof, explicit approval, and a
payment you can reconcile. That is the entire loop you are about to see — on real
Channel3 data and the real PayPal Sandbox."

## 0:35–1:15 — Scenario A: successful purchase

**Screen:** Agent Workspace. Request: `Find a USB-C cable under $30`, objective
`lowest_cost`. Run it.

**Voice-over:** "Twenty live Channel3 offers are evaluated with decimal-safe
arithmetic. The optimizer selects one $8.49 USB-C cable and emits a Decision
Proof. The proof records candidates, requirements, totals, every policy check,
uncertainties, and a SHA-256 integrity hash."

**Screen:** Open the proof. Point at the green SHA-256 badge and policy checks.

**Voice-over:** "Nothing here is a mock. The API recomputes the hash on read —
tamper with a stored price and verification flips to false."

## 1:15–1:45 — Human approval and PayPal

**Screen:** Click **Approve and continue to PayPal →**. Show the PayPal Sandbox
order and the buyer payment page briefly.

**Voice-over:** "Approval is mandatory and cannot be disabled through the API.
Only after sign-off does OmniBuy create a PayPal Orders v2 order with an
idempotency key. The buyer authorizes in PayPal Sandbox."

**Screen:** Return to `/checkout?token=...`. Show **Payment captured**, capture ID
`0KF06784HS030572L`, then Audit Ledger.

**Voice-over:** "The browser never declares success. The server captures the
order, verifies it belongs to this approved proof, and persists capture
`0KF06784HS030572L`. A second capture returns 409."

## 1:45–2:15 — Scenario B: Policy Guard blocks

**Screen:** Policy Guard. Set the per-session cap to a low value (or add a
restricted category), run a simulation, show **BLOCKED** and the intercept log.
Restore defaults.

**Voice-over:** "Policy Guard is persisted server-side and enforced on the next
proposal. Caps, merchant allowlists, restricted categories, USD-only settlement
— all deterministic, none delegated to the model."

**Screen:** Open blocked proof `DEC-01A2361E172B` or run `Find an ergonomic office
chair under $50`.

**Voice-over:** "Here the cheapest compliant cart is above the request budget.
The proof is blocked, and the payment endpoint refuses to create an order."

## 2:15–2:40 — Scenario C: re-optimization

**Screen:** Decision Proofs filtered to webcam proofs, or click **Re-optimize for
highest quality** on a proof.

**Voice-over:** "Re-running the same request with a different objective changes
the bundle deterministically: $9.99 at lowest cost, versus $57.65 for the
5-star Anker at best value and highest quality. Same candidates, same math,
different explicit objective."

## 2:40–2:55 — Close

**Screen:** Audit Ledger with the completed transaction, order and capture IDs.

**Voice-over:** "Discovery, optimization, policy, proof, approval, payment,
reconciliation. OmniBuy AI — AI can decide what to buy, and OmniBuy proves it
should."

## Recording checklist

- [ ] API and web running with live Channel3 + PayPal Sandbox credentials.
- [ ] Browser at 1440×900, no other tabs or notifications visible.
- [ ] Use a fresh request so the live latency looks natural.
- [ ] Show one real PayPal payment; do not fake the return URL.
- [ ] Keep the final video under 3:00 and upload to YouTube/Vimeo as unlisted or public.
- [ ] Add the video URL to Devpost and to the README once uploaded.
