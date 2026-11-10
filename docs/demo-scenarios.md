# OmniBuy AI demo scenarios

All scenarios use live Channel3 discovery and real PayPal Sandbox APIs. Proof IDs
below are from the recorded 2026-11-10 run and remain queryable through
`GET /api/decision-proofs/{id}`.

## A — Successful purchase

Request: `Find a USB-C cable under $30` (objective `lowest_cost`).

1. Run the request in **Agent Workspace** (or `POST /api/proposals`).
2. Review the candidate count, selected product and Decision Proof.
3. Approve the proof — approval is mandatory and cannot be disabled.
4. Open the returned PayPal Sandbox approval URL.
5. Sign in as the Sandbox buyer and pay.
6. PayPal returns to `/checkout?token=...`; the app captures the order server-side.
7. Confirm the proof status and capture ID in **Audit Ledger**.

Recorded evidence:

- Proof `DEC-740479248D32`, status `completed`, `integrity_verified: true`
- PayPal order `5BF91167MC9125519`
- PayPal capture `0KF06784HS030572L`
- Total `$8.49`, selected item: C2G 6ft USB-C cable

## B — Policy violation

Request: `Find an ergonomic office chair under $50` (objective `lowest_cost`).

The cheapest compliant option from Channel3 is above the budget, so the optimizer
returns no cart and Policy Guard marks `non_empty_cart`, `required_categories` and
`human_approval` as failed. The proof is `blocked`; the API returns `409` if a
PayPal order is attempted.

Recorded evidence:

- Proof `DEC-01A2361E172B`, status `blocked`, total `$0.00`, no selected products
- No PayPal order or capture exists for this proof

A second policy path is available in **Policy Guard → Live Simulation**: add
`Amazon` to the merchant allowlist requirement, simulate a different merchant, and
the run is recorded as `BLOCKED` in the intercept log with a downloadable CSV.

## C — Re-optimization

Request: `Find a webcam under $200`, run with three objectives. The deterministic
optimizer re-runs over the same live candidate set; only the objective changes.

| Objective | Proof | Total | Selected |
| --- | --- | --- | --- |
| `lowest_cost` | `DEC-D73D90B5D1B8` | `$9.99` | 1080P Webcam with Mic (3.1★, 9 reviews) |
| `best_value` | `DEC-9DA789607206` | `$57.65` | Anker PowerConf C200 HD 2K WebCam (5.0★, 17 reviews) |
| `highest_quality` | `DEC-61E1D6553AB0` | `$57.65` | Anker PowerConf C200 HD 2K WebCam (5.0★, 17 reviews) |

From a Decision Proof detail page, the **Re-optimize for lowest cost** and
**Re-optimize for highest quality** links prefill the Agent Workspace with the
same request, budget and a new objective.

## Failure-path checks worth showing

- Try **Approve** twice → second approval returns `409`.
- Try **Reject** after approval → returns `409`.
- Try creating a PayPal order from a rejected/blocked proof → returns `409`.
- Call the capture endpoint twice → second call returns `409` without contacting PayPal.
