"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Product = {
  id: string;
  title: string;
  brand?: string;
  merchant: string;
  price: string;
  currency: string;
  image_url?: string;
  product_url: string;
  availability: string;
  category?: string;
  specifications?: { quality_score?: number; rating_value?: number | null; rating_count?: number };
};

const usd = (value: number | string) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Workspace() {
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("900");
  const [objective, setObjective] = useState("best_value");
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [paypal, setPaypal] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequest(params.get("request") || "");
    setBudget(params.get("budget") || "900");
    setObjective(params.get("objective") || "best_value");
  }, []);

  async function run() {
    const budgetNumber = Number(budget);
    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      setError("Enter a maximum budget greater than zero.");
      return;
    }
    setLoading(true);
    setError("");
    setProof(null);
    setApproved(false);
    setPaypal(null);
    try {
      const response = await fetch(`${API}/api/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, budget, currency: "USD", objective }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The proposal could not be created.");
      setProof(data.proof);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!proof) return;
    setLoading(true);
    setError("");
    try {
      const approval = await fetch(`${API}/api/decision-proofs/${proof.decision_id}/approve`, { method: "POST" });
      const approvalData = await approval.json();
      if (!approval.ok) throw new Error(approvalData.detail || "Approval failed.");
      setProof((current: any) => ({ ...current, status: "approved" }));
      setApproved(true);
      const order = await fetch(`${API}/api/paypal/orders?decision_id=${encodeURIComponent(proof.decision_id)}`, { method: "POST" });
      const orderData = await order.json();
      if (!order.ok) throw new Error(orderData.detail || "PayPal order creation failed.");
      setPaypal(orderData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  const status = proof?.status || (loading ? "running" : "idle");
  const blocked = status === "blocked";
  const approveLink = paypal?.links?.find((link: any) => link.rel === "approve")?.href;

  const stages = [
    { title: "Understanding requirements", detail: request.trim() || "Waiting for a shopping request", state: proof ? "done" : loading ? "active" : "idle" },
    { title: "Discovering products", detail: proof ? `${proof.evaluated_candidates} candidates evaluated on Channel3` : "Verified merchant catalog", state: proof ? "done" : loading ? "active" : "idle" },
    { title: "Comparing alternatives", detail: proof ? `${proof.alternatives?.length || 0} alternative bundles computed` : "Pareto comparison", state: proof ? "done" : "idle" },
    { title: "Optimizing combinations", detail: proof ? `${usd(proof.optimization.total)} optimized total` : "Deterministic optimizer", state: proof ? "done" : "idle" },
    { title: "Verifying purchase policies", detail: proof ? (blocked ? "Policy Guard intercepted this proposal" : `${proof.policy.checks.filter((check: any) => check.passed).length} deterministic checks passed`) : "Server-side Policy Guard", state: proof ? (blocked ? "blocked" : "done") : "idle" },
    { title: "Awaiting human approval", detail: ["approved", "checkout_pending", "completed"].includes(status) ? "Approved by supervisor" : status === "rejected" ? "Rejected by supervisor" : proof ? "Decision Proof ready for sign-off" : "Locked until verification", state: ["approved", "checkout_pending", "completed"].includes(status) ? "done" : status === "rejected" || blocked ? "blocked" : proof ? "active" : "idle" },
  ];

  return (
    <div className="content ws-page">
      <div className="ws-head">
        <div>
          <div className="ws-breadcrumb">OMNIBUY <span>/</span> WORKSPACE <span>/</span> {proof ? proof.decision_id : "NEW SESSION"}</div>
          <h1>Agent Workspace</h1>
          <p>Live discovery, deterministic optimization and policy verification. Nothing is paid until a human approves the Decision Proof.</p>
        </div>
        <div className="ws-head-status">
          <span className={`ws-agent-state ${status}`}>● {loading ? "Agent Active: Optimizing" : proof ? `Proof ${String(status).replaceAll("_", " ")}` : "Agent Ready"}</span>
          <span className="ws-safe">🔒 Sandbox · human approval required</span>
        </div>
      </div>

      <div className="ws-grid">
        <aside className="ws-activity">
          <div className="ws-card-head"><label>AI AGENT ACTIVITY</label><span>6 STAGES</span></div>
          <div className="ws-timeline">
            {stages.map((stage, index) => (
              <div className={`ws-step ${stage.state}`} key={stage.title}>
                <span className="ws-step-dot">{stage.state === "done" ? "✓" : stage.state === "blocked" ? "!" : stage.state === "active" ? "●" : index + 1}</span>
                <div><b>{stage.title}</b><small>{stage.detail}</small></div>
              </div>
            ))}
          </div>
          <div className="ws-activity-foot">
            <span>Engine v2.4 · LangGraph</span>
            <span>{proof ? "Deterministic run" : "Standing by"}</span>
          </div>
        </aside>

        <section className="ws-center">
          <div className="ws-card ws-intent">
            <div className="ws-card-head"><label>USER INTENT</label><span>{objective.replaceAll("_", " ").toUpperCase()}</span></div>
            <textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Equip a two-person home office with ergonomic products..." />
            <div className="ws-fields">
              <label><span>MAXIMUM BUDGET</span><div className="ws-input"><b>$</b><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" /><i>USD</i></div></label>
              <label><span>OBJECTIVE</span><select value={objective} onChange={(event) => setObjective(event.target.value)}><option value="best_value">Best overall value</option><option value="lowest_cost">Lowest cost</option><option value="highest_quality">Highest quality</option></select></label>
            </div>
            <button className="run" onClick={run} disabled={loading || request.trim().length < 3}>
              {loading ? "Researching live products and verifying…" : "▶ Research and verify with Policy Guard"}
            </button>
            {error && <div className="cc-result blocked"><b>Run failed</b><span>{error}</span></div>}
          </div>

          <div className="ws-card ws-bundle">
            <div className="ws-card-head">
              <label>RECOMMENDED CONFIGURATION</label>
              {proof && <span className={`session-status ${proof.status}`}>{String(proof.status).replaceAll("_", " ")}</span>}
            </div>
            {!proof ? (
              <div className="ws-empty">
                <span>✦</span>
                <b>Your verified bundle will appear here</b>
                <p>OmniBuy will show the real products it evaluated, the selected configuration and the deterministic policy checks before payment.</p>
              </div>
            ) : (
              <>
                <h2>{proof.requirements.request}</h2>
                <p className="ws-bundle-copy">{proof.selected_products?.length || 0} products selected from {proof.evaluated_candidates} evaluated candidates · {proof.requirements.currency} settlement.</p>
                <div className="ws-products">
                  {proof.selected_products?.length ? proof.selected_products.map((product: Product) => (
                    <article className="ws-product" key={product.id}>
                      <div className="ws-product-image">{product.image_url ? <img src={product.image_url} alt={product.title} /> : <span>◈</span>}</div>
                      <div className="ws-product-copy">
                        <small>{product.merchant} · {product.availability.replaceAll("_", " ")}</small>
                        <b>{product.title}</b>
                        <span>{product.brand || product.category}{product.specifications?.rating_value ? ` · ${product.specifications.rating_value.toFixed(1)}★ (${product.specifications.rating_count})` : " · no buyer rating"}</span>
                      </div>
                      <div className="ws-product-price">
                        <strong>{usd(product.price)}</strong>
                        <a href={product.product_url} target="_blank" rel="noreferrer">Inspect ↗</a>
                      </div>
                    </article>
                  )) : <p className="muted">No compliant product combination was found.</p>}
                </div>
                {proof.alternatives?.length ? (
                  <div className="ws-alternatives">
                    <label>ALTERNATIVES EVALUATED</label>
                    {proof.alternatives.map((alternative: Product[], index: number) => (
                      <div className="alternative" key={index}>
                        <span>Option {index + 2}</span>
                        <b>{usd(alternative.reduce((total, product) => total + Number(product.price), 0))}</b>
                        <small>{alternative.map((product) => product.title).join(" · ")}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <aside className="ws-side">
          <div className="ws-card ws-optimizer">
            <div className="ws-card-head"><label>LIVE BUDGET OPTIMIZER</label><span>{proof ? "DETERMINISTIC" : "WAITING"}</span></div>
            {!proof ? (
              <div className="ws-opt-empty">
                <b>No active bundle</b>
                <p>Budget allocation, optimized spend and remaining surplus appear after the first verified run.</p>
              </div>
            ) : (
              <>
                <div className="ws-budget-row"><span>Total budget cap</span><b>{usd(proof.requirements.budget)}</b></div>
                <div className="ws-budget-row"><span>Optimized cart</span><b className="lime">{usd(proof.optimization.total)}</b></div>
                <div className="ws-budget-row"><span>Remaining surplus</span><b className="lime">+{usd(proof.optimization.remaining_budget)}</b></div>
                <div className="ws-alloc">
                  <div className="ws-alloc-bar"><span style={{ width: `${Math.min(100, (Number(proof.optimization.total) / Math.max(1, Number(proof.requirements.budget))) * 100)}%` }} /></div>
                  <small>{Math.round(Math.min(100, (Number(proof.optimization.total) / Math.max(1, Number(proof.requirements.budget))) * 100))}% allocated</small>
                </div>
                <div className="ws-tally">
                  <label>ITEMIZED CART TALLY</label>
                  {proof.selected_products?.map((product: Product) => (
                    <div key={product.id}><span>{product.title}</span><b>{usd(product.price)}</b></div>
                  ))}
                  <div className="ws-tally-total"><span>Total commitment</span><b>{usd(proof.optimization.total)}</b></div>
                </div>
                <div className="ws-policy">
                  <label>POLICY GUARD</label>
                  {proof.policy.checks.map((check: any) => (
                    <div key={check.name} className={check.passed ? "pass" : "pending"}>
                      <span>{check.passed ? "✓" : "○"}</span>
                      <b>{check.name.replaceAll("_", " ")}</b>
                    </div>
                  ))}
                </div>
                {blocked ? (
                  <div className="blocked-proof">Policy Guard blocked this proposal. Adjust the request or budget here, or tune the limits in Policy Guard, then run again.</div>
                ) : paypal?.paypal_order_id ? (
                  <div className="checkout-ready">
                    <b>PayPal order {paypal.paypal_order_id}</b>
                    <small>Approve the payment in PayPal Sandbox. The return page captures it server-side.</small>
                    {approveLink && <a className="run" href={approveLink}>Open PayPal Sandbox →</a>}
                  </div>
                ) : (
                  <button className="run" onClick={approve} disabled={loading || !["awaiting_approval", "approved"].includes(proof.status)}>
                    {loading ? "Creating secure order…" : approved ? "Create PayPal order" : "✓ Approve and continue to PayPal"}
                  </button>
                )}
              </>
            )}
          </div>
          {proof && <Link className="proof-detail-link" href={`/decision-proofs/${proof.decision_id}`}>Open full Decision Proof and audit timeline →</Link>}
        </aside>
      </div>
    </div>
  );
}
