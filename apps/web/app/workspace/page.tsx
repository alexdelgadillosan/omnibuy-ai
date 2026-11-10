"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Workspace() {
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("900");
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [paypal, setPaypal] = useState<any>(null);
  useEffect(() => { setRequest(new URLSearchParams(window.location.search).get("request") || ""); }, []);
  async function run() {
    setLoading(true); setError(""); setProof(null); setApproved(false); setPaypal(null);
    try { const response = await fetch(`${API}/api/proposals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, budget, currency: "USD", objective: "best_value" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || "The proposal could not be created."); setProof(data.proof); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); }
  }
  async function approve() {
    if (!proof) return;
    setLoading(true); setError("");
    try {
      const approval = await fetch(`${API}/api/decision-proofs/${proof.decision_id}/approve`, { method: "POST" });
      const approvalData = await approval.json();
      if (!approval.ok) throw new Error(approvalData.detail || "Approval failed.");
      setApproved(true);
      const order = await fetch(`${API}/api/paypal/orders?decision_id=${encodeURIComponent(proof.decision_id)}`, { method: "POST" });
      const orderData = await order.json();
      if (!order.ok) throw new Error(orderData.detail || "PayPal order creation failed.");
      setPaypal(orderData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); }
  }
  return <div className="workspace content"><div className="workspace-head"><div><label>AGENT WORKSPACE / LIVE RUN</label><h1>Build a purchase plan.</h1><p>OmniBuy will discover candidates, optimize the cart, and generate a Decision Proof before any payment.</p></div><span className="pill">● Awaiting request</span></div><div className="workspace-grid"><section className="workspace-card"><label>USER INTENT</label><textarea value={request} onChange={e=>setRequest(e.target.value)} placeholder="Equip a two-person home office with ergonomic products..."/><div className="field-row"><label>MAXIMUM BUDGET <input value={budget} onChange={e=>setBudget(e.target.value)} inputMode="decimal" /></label><span>USD</span><label>OBJECTIVE <strong>Best overall value</strong></label></div><button className="run" onClick={run} disabled={loading || request.trim().length<3}>{loading ? "Running verification…" : "▶ Research and verify"}</button>{error && <div className="error">{error}</div>}</section><section className="workspace-card proof-card"><label>DECISION PROOF</label>{proof ? <><div className="proof-status">✓ {proof.status.replaceAll("_", " ")}</div><h2>{proof.decision_id}</h2><p>Evaluated {proof.evaluated_candidates} candidates. Proposed total: <b>${proof.optimization.total} USD</b>.</p><div className="checks">{proof.policy.checks.map((check:any)=><div key={check.name}><span className={check.passed?"pass":"pending"}>{check.passed?"✓":"○"}</span><b>{check.name.replaceAll("_", " ")}</b><small>{check.detail}</small></div>)}</div>{!approved ? <button className="run" onClick={approve} disabled={loading}>✓ Approve Decision Proof and create PayPal order</button> : <div className="checkout-ready"><b>PayPal order created</b><small>{paypal?.paypal_order_id}</small>{paypal?.links?.find((link:any)=>link.rel === "approve")?.href && <a className="run" href={paypal.links.find((link:any)=>link.rel === "approve").href}>Open PayPal Sandbox →</a>}</div>}</> : <div className="proof-empty"><span>✦</span><b>Your proof will appear here</b><p>No payment can start until the proposed cart passes the Policy Guard and you approve it.</p></div>}</section></div></div>;
}
