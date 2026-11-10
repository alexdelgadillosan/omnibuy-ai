"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Product = { id: string; title: string; brand?: string; merchant: string; price: string; currency: string; image_url?: string; product_url: string; availability: string };

export default function Workspace() {
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("900");
  const [objective, setObjective] = useState("best_value");
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [paypal, setPaypal] = useState<any>(null);

  useEffect(() => { setRequest(new URLSearchParams(window.location.search).get("request") || ""); }, []);

  async function run() {
    setLoading(true); setError(""); setProof(null); setApproved(false); setPaypal(null);
    try {
      const response = await fetch(`${API}/api/proposals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, budget, currency: "USD", objective }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The proposal could not be created.");
      setProof(data.proof);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); }
  }

  async function approve() {
    if (!proof) return;
    setLoading(true); setError("");
    try {
      const approval = await fetch(`${API}/api/decision-proofs/${proof.decision_id}/approve`, { method: "POST" });
      const approvalData = await approval.json();
      if (!approval.ok) throw new Error(approvalData.detail || "Approval failed.");
      const order = await fetch(`${API}/api/paypal/orders?decision_id=${encodeURIComponent(proof.decision_id)}`, { method: "POST" });
      const orderData = await order.json();
      if (!order.ok) throw new Error(orderData.detail || "PayPal order creation failed.");
      setApproved(true); setPaypal(orderData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); }
  }

  return <div className="workspace content">
    <div className="workspace-head"><div><label>AGENT WORKSPACE / LIVE RUN</label><h1>Build a purchase plan.</h1><p>OmniBuy discovers real products, compares candidates, optimizes the cart and generates a Decision Proof before payment.</p></div><span className="pill">● {proof ? "Proof generated" : "Awaiting request"}</span></div>
    <div className="workspace-grid">
      <section className="workspace-card"><label>USER INTENT</label><textarea value={request} onChange={e=>setRequest(e.target.value)} placeholder="Equip a two-person home office with ergonomic products..."/><div className="field-row"><label>MAXIMUM BUDGET <input value={budget} onChange={e=>setBudget(e.target.value)} inputMode="decimal" /></label><span>USD</span><label>OBJECTIVE <select value={objective} onChange={e=>setObjective(e.target.value)}><option value="best_value">Best overall value</option><option value="lowest_cost">Lowest cost</option><option value="highest_quality">Highest quality</option></select></label></div><button className="run" onClick={run} disabled={loading || request.trim().length<3}>{loading ? "Researching live products…" : "▶ Research and verify"}</button>{error && <div className="error">{error}</div>}</section>
      <section className="workspace-card proof-card"><label>DECISION PROOF</label>{!proof ? <div className="proof-empty"><span>✦</span><b>Your verified plan will appear here</b><p>Submit a real shopping request. OmniBuy will show the products it evaluated, the selected configuration and every policy check.</p></div> : <><div className="proof-status">✓ {proof.status.replaceAll("_", " ")}</div><h2>{proof.decision_id}</h2><div className="workspace-total"><span>PROPOSED TOTAL</span><b>${proof.optimization.total} USD</b><small>${proof.optimization.remaining_budget} remaining · {proof.evaluated_candidates} candidates evaluated</small></div><div className="workspace-products"><h3>Selected products</h3>{proof.selected_products?.length ? proof.selected_products.map((product: Product)=><ProductRow key={product.id} product={product}/>) : <p className="muted">No compliant product combination found.</p>}</div><div className="workspace-alternatives"><h3>Alternatives evaluated</h3>{proof.alternatives?.length ? proof.alternatives.map((alternative: Product[], index: number)=><div className="alternative" key={index}><span>Option {index + 2}</span><b>${alternative.reduce((total, product)=>total+Number(product.price), 0).toFixed(2)} USD</b><small>{alternative.map(product=>product.title).join(" · ")}</small></div>) : <p className="muted">No alternative configuration was returned.</p>}</div><div className="checks">{proof.policy.checks.map((check:any)=><div key={check.name}><span className={check.passed?"pass":"pending"}>{check.passed?"✓":"○"}</span><b>{check.name.replaceAll("_", " ")}</b><small>{check.detail}</small></div>)}</div>{proof.status === "blocked" ? <div className="blocked-proof">This proposal is blocked by Policy Guard. Change the request or budget to generate a compliant alternative.</div> : !approved ? <button className="run" onClick={approve} disabled={loading}>✓ Approve Decision Proof and create PayPal order</button> : <div className="checkout-ready"><b>PayPal order created</b><small>{paypal?.paypal_order_id}</small>{paypal?.links?.find((link:any)=>link.rel === "approve")?.href && <a className="run" href={paypal.links.find((link:any)=>link.rel === "approve").href}>Open PayPal Sandbox →</a>}</div>}</>}</section>
    </div>
    {proof && <Link className="proof-detail-link" href={`/decision-proofs/${proof.decision_id}`}>Open full Decision Proof and audit timeline →</Link>}
  </div>;
}

function ProductRow({ product }: { product: Product }) { return <article className="workspace-product"><div className="workspace-product-image">{product.image_url ? <img src={product.image_url} alt={product.title}/> : <span>◈</span>}</div><div><b>{product.title}</b><small>{product.brand || "Verified product"} · {product.merchant}</small></div><strong>${product.price} {product.currency}</strong></article>; }
