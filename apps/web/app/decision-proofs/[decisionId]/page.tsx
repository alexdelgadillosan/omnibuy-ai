"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DecisionProofDetail() {
  const params = useParams<{ decisionId: string }>();
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [paypal, setPaypal] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/decision-proofs/${encodeURIComponent(params.decisionId)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Decision Proof not found"); setProof(data); })
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [params.decisionId]);

  async function approve() {
    setWorking(true); setError("");
    try {
      const approval = await fetch(`${API}/api/decision-proofs/${encodeURIComponent(params.decisionId)}/approve`, { method: "POST" });
      const approvalData = await approval.json();
      if (!approval.ok) throw new Error(approvalData.detail || "Approval failed");
      const order = await fetch(`${API}/api/paypal/orders?decision_id=${encodeURIComponent(params.decisionId)}`, { method: "POST" });
      const orderData = await order.json();
      if (!order.ok) throw new Error(orderData.detail || "PayPal order creation failed");
      setPaypal(orderData); setProof((current: any) => ({ ...current, status: "checkout_pending" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setWorking(false); }
  }

  if (error) return <div className="content proof-detail"><Link href="/decision-proofs" className="back-link">← Decision Proofs</Link><div className="detail-error"><h1>Proof unavailable</h1><p>{error}</p></div></div>;
  if (!proof) return <div className="content proof-detail"><span className="proof-loading">Loading Decision Proof…</span></div>;
  const selected = proof.selected_products || [];
  return <div className="content proof-detail">
    <div className="detail-top"><div><Link href="/decision-proofs" className="back-link">← Decision Proofs</Link><label>DECISION PROOF / {proof.decision_id}</label><h1>Verified purchase decision</h1><p>Every claim below is separated into deterministic facts, policy checks and AI-assisted assessment.</p></div><span className={`detail-status status-${proof.status}`}>{proof.status.replaceAll("_", " ")}</span></div>
    <div className="proof-layout">
      <main>
        <section className="proof-section proof-summary"><div className="section-label">VERIFICATION SUMMARY</div><div className="proof-numbers"><div><small>PROPOSED SPEND</small><strong>${proof.optimization.total} <i>{proof.requirements.currency}</i></strong></div><div><small>REMAINING BUDGET</small><strong>${proof.optimization.remaining_budget}</strong></div><div><small>CANDIDATES EVALUATED</small><strong>{proof.evaluated_candidates}</strong></div><div><small>QUALITY SCORE</small><strong>{proof.optimization.quality_score}</strong></div></div></section>
        <section className="proof-section"><div className="section-label">SELECTED CONFIGURATION</div><div className="product-list">{selected.length ? selected.map((product:any)=><article key={product.id}><div className="product-icon">◈</div><div><b>{product.title}</b><small>{product.brand || "Verified product"} · {product.merchant}</small></div><strong>${product.price} {product.currency}</strong></article>) : <p className="muted">No compliant products were selected.</p>}</div></section>
        <section className="proof-section"><div className="section-label">POLICY GUARD CHECKS</div><div className="proof-checks">{proof.policy.checks.map((check:any)=><div key={check.name}><span className={check.passed ? "check-pass" : "check-pending"}>{check.passed ? "✓" : "!"}</span><div><b>{check.name.replaceAll("_", " ")}</b><small>{check.detail}</small></div><em>{check.passed ? "PASS" : "REVIEW"}</em></div>)}</div></section>
        <section className="proof-section"><div className="section-label">AUDIT TIMELINE</div><div className="timeline">{(proof.workflow_events || []).map((event:any)=><div key={event.type}><span>●</span><div><b>{event.type.replaceAll("_", " ")}</b><small>{event.state || "OmniBuy workflow"}</small></div></div>)}<div><span>○</span><div><b>human approval</b><small>Required before any payment</small></div></div></div></section>
      </main>
      <aside className="proof-side"><section className="proof-section"><div className="section-label">DECISION CONTROL</div><p className="fact">Facts are calculated from the live discovery response and server-side policy engine.</p><div className="side-line"><span>Objective</span><b>{proof.requirements.objective.replaceAll("_", " ")}</b></div><div className="side-line"><span>Currency</span><b>{proof.requirements.currency}</b></div><div className="side-line"><span>Payment</span><b>PayPal Sandbox</b></div>{proof.status === "awaiting_approval" && <button className="run" onClick={approve} disabled={working}>{working ? "Creating secure order…" : "Approve and continue to PayPal →"}</button>}{paypal?.links?.find((link:any)=>link.rel === "approve")?.href && <a className="run" href={paypal.links.find((link:any)=>link.rel === "approve").href}>Open PayPal Sandbox →</a>}{paypal && <small className="order-id">Order {paypal.paypal_order_id}</small>}</section><section className="proof-section"><div className="section-label">PROOF INTEGRITY</div><p className="fact">Decision ID</p><code>{proof.decision_id}</code><p className="fact">Created</p><code>{proof.created_at}</code></section></aside>
    </div>
  </div>;
}
