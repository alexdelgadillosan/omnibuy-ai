# Demo video script (under 3:00)

Target length: **2:55**. Record at 1440×900, browser zoom 100%, no personal tabs
visible. Keep the cursor deliberate; do not cut away from real API responses.

> A silent 2:52 screen recording is available at
> `docs/demo/omnibuy-demo-silent-2m52.mp4` (kept out of git because of size).
> It covers the pre-LLM flow: Command Center → Agent Workspace → completed
> proof `DEC-740479248D32` → Policy Guard → re-optimization → Audit Ledger.
> **Scenario A must be re-recorded** to capture the new natural-language
> intent parsing (the agent now extracts budget, objective and merchant from
> free text with a live LLM call); the other segments can reuse the silent
> base with new narration.

## 0:00–0:15 — Hook

**Screen:** Command Center.

**Voice-over:** "Autonomous agents can already find the best product. The hard
part is trusting them with money. OmniBuy AI lets an agent decide — but proves
every decision, enforces policy server-side, and requires a human before PayPal
is ever called."

## 0:15–0:30 — Problem framing

**Screen:** Scroll the pipeline panel and metrics.

**Voice-over:** "A chat response is not a purchase order. You need live
discovery, deterministic math, a policy gate, an auditable proof, explicit
approval, and a payment you can reconcile — the whole loop, on real Channel3
data and the real PayPal Sandbox."

## 0:30–0:50 — Scenario A (part 1): natural-language intent parsing

**Screen:** Agent Workspace. Leave **Maximum Budget empty**. Type in plain
English: `Find me the cheapest USB-C cable under $30`. Click **Research and
verify with Policy Guard**.

**Voice-over:** "No forms, no dropdowns — the request is free text. An LLM
parses the intent server-side: it extracts the thirty-dollar budget and the
lowest-cost objective, and records exactly what it extracted on the Decision
Proof. If the LLM is unavailable or returns garbage, the run falls back to the
persisted policy cap — it never invents data and never blocks the flow."

## 0:50–1:20 — Scenario A (part 2): proof and integrity

**Screen:** The activity stage reads "Intent parsed from natural language
(LLM)". Point at the selected cable (about $2.99–$8.49 on the live market), the
evaluated-candidate count, then open the proof's policy checks and SHA-256
badge.

**Voice-over:** "Twenty live Channel3 offers are evaluated with decimal-safe
arithmetic. The proof records candidates, requirements, totals, every policy
check, uncertainties, and a SHA-256 integrity hash. Nothing here is a mock —
the API recomputes the hash on read; tamper with a stored price and
verification flips to false."

## 1:20–1:50 — Human approval and PayPal

**Screen:** Click **Approve and continue to PayPal →**. Show the PayPal Sandbox
order and the buyer payment page briefly.

**Voice-over:** "Approval is mandatory and cannot be disabled through the API.
Only after sign-off does OmniBuy create a PayPal Orders v2 order with an
idempotency key. The buyer authorizes in PayPal Sandbox."

**Screen:** Return to `/checkout?token=...`. Show **Payment captured**, capture
ID `0KF06784HS030572L`, then Audit Ledger.

**Voice-over:** "The browser never declares success. The server captures the
order, verifies it belongs to this approved proof, and persists the capture. A
second capture returns 409."

## 1:50–2:20 — Scenario B: Policy Guard blocks

**Screen:** Policy Guard. Set the per-session cap to a low value (or add a
restricted category), run a simulation, show **BLOCKED** and the intercept log.
Restore defaults.

**Voice-over:** "Policy Guard is persisted server-side and enforced on the next
proposal. Caps, merchant allowlists, restricted categories, USD-only settlement
— all deterministic, none delegated to the model. Here the cheapest compliant
cart is above the request budget: the proof is blocked, and the payment
endpoint refuses to create an order."

## 2:20–2:45 — Scenario C: re-optimization

**Screen:** Decision Proofs filtered to webcam proofs, or click **Re-optimize for
highest quality** on a proof.

**Voice-over:** "Re-running the same request with a different objective changes
the bundle deterministically: $9.99 at lowest cost, versus $57.65 for the
5-star Anker at best value and highest quality. Same candidates, same math,
different explicit objective."

## 2:45–2:55 — Close

**Screen:** Audit Ledger with the completed transaction, order and capture IDs.

**Voice-over:** "Discovery, intent, optimization, policy, proof, approval,
payment, reconciliation. OmniBuy AI — AI can decide what to buy, and OmniBuy
proves it should."

## Recording checklist

- [ ] API and web running with live Channel3 + PayPal Sandbox **and LLM**
      credentials (`LLM_API_KEY` — intent parsing is live in the demo).
- [ ] Browser at 1440×900, no other tabs or notifications visible.
- [ ] Use a fresh request so the live latency looks natural; leave the budget
      field empty so the LLM parse is visible in the activity timeline.
- [ ] Show one real PayPal payment; do not fake the return URL.
- [ ] Keep the final video under 3:00 and upload to YouTube as **public**
      (Devpost requires a publicly visible video).
- [ ] Add the video URL to Devpost and to the README once uploaded.
