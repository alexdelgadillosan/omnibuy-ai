# OmniBuy AI demo scenarios

These scenarios use live Channel3 discovery and never treat demo products as live data.

## A — Successful purchase

Request: `Find an ergonomic office chair under $500`.

1. Run the request in Agent Workspace.
2. Review the candidate count and Decision Proof.
3. Approve the proof.
4. Open the PayPal Sandbox approval URL.
5. Return to `/checkout?token=...` after approval.
6. Confirm the capture ID in Audit Ledger.

## B — Policy violation

Request: `Find an ergonomic office chair under $50` with a candidate set whose
cheapest compliant option is above the limit. The optimizer returns no compliant
cart and Policy Guard marks `non_empty_cart` and/or `budget_cap` as failed.
No PayPal order can be created from a blocked proof.

## C — Re-optimization

Run the same request with objective `lowest_cost`, then repeat with
`highest_quality`. The deterministic optimizer returns the selected cart,
alternatives, total and quality score for each objective.
