"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const usd = (value: number | string) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DecisionProofDetail() {
  const params = useParams<{ decisionId: string }>();
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [paypal, setPaypal] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/decision-proofs/${encodeURIComponent(params.decisionId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Decision Proof not found");
        setProof(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [params.decisionId]);

  async function approve() {
    setWorking(true);
    setError("");
    try {
      const approval = await fetch(`${API}/api/decision-proofs/${encodeURIComponent(params.decisionId)}/approve`, { method: "POST" });
      const approvalData = await approval.json();
      if (!approval.ok) throw new Error(approvalData.detail || "Approval failed");
      const order = await fetch(`${API}/api/paypal/orders?decision_id=${encodeURIComponent(params.decisionId)}`, { method: "POST" });
      const orderData = await order.json();
      if (!order.ok) throw new Error(orderData.detail || "PayPal order creation failed");
      setPaypal(orderData);
      setProof((current: any) => ({ ...current, status: "checkout_pending" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }

  async function reject() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/decision-proofs/${encodeURIComponent(params.decisionId)}/reject`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Rejection failed");
      setProof((current: any) => ({ ...current, status: "rejected", rejected_at: data.rejected_at }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }

  if (error && !proof) {
    return (
      <div className="content dp-page">
        <Link href="/decision-proofs" className="back-link">← Decision Proofs</Link>
        <div className="detail-error"><h1>Proof unavailable</h1><p>{error}</p></div>
      </div>
    );
  }
  if (!proof) return <div className="content dp-page"><span className="proof-loading">Loading Decision Proof…</span></div>;

  const selected = proof.selected_products || [];
  const settings = proof.policy_settings || {};
  const checks = proof.policy?.checks || [];
  const check = (name: string) => checks.find((item: any) => item.name === name);
  const passCount = checks.filter((item: any) => item.passed).length;
  const required = proof.requirements?.required_categories || [];
  const satisfied = proof.policy?.checks?.find((item: any) => item.name === "required_categories");
  const requiredSatisfied = required.length ? (satisfied?.passed ? required.length : 0) : 0;
  const merchants = Array.from(new Set(selected.map((product: any) => product.merchant)));
  const itemCeiling = Number(settings.max_item_price || 0) || Math.max(...selected.map((product: any) => Number(product.price)), 0);
  const maxItem = Math.max(0, ...selected.map((product: any) => Number(product.price)));
  const hash = proof.integrity_hash ? `0x${proof.integrity_hash.slice(0, 8)}…${proof.integrity_hash.slice(-4)}` : "not recorded";
  const blocked = proof.status === "blocked";

  const pipeline = [
    { label: "User intent", detail: proof.requirements?.request?.slice(0, 74), ref: hash, state: "done" },
    { label: "Candidate retrieval", detail: `${proof.evaluated_candidates} live products evaluated`, ref: hash, state: "done" },
    { label: "OmniBuy optimizer", detail: `${usd(proof.optimization?.total)} deterministic total`, ref: hash, state: "done" },
    { label: "Policy Guard", detail: blocked ? "Blocked · deterministic rule failure" : `${passCount} checks passed`, ref: hash, state: blocked ? "blocked" : "done" },
    { label: "Human sign-off", detail: ["approved", "checkout_pending", "completed"].includes(proof.status) ? "Approved by supervisor" : proof.status === "rejected" ? "Rejected by supervisor" : "Awaiting supervisor", ref: hash, state: ["approved", "checkout_pending", "completed"].includes(proof.status) ? "done" : proof.status === "rejected" ? "blocked" : blocked ? "idle" : "active" },
    { label: "PayPal settlement", detail: proof.status === "completed" ? `Capture ${proof.paypal_capture_id || "recorded"}` : proof.paypal_order_id ? `Order ${proof.paypal_order_id} · capture pending` : "Locked until approval", ref: proof.paypal_capture_id ? `0x${String(proof.paypal_capture_id).slice(0, 8)}` : hash, state: proof.status === "completed" ? "done" : proof.paypal_order_id ? "active" : "idle" },
  ];

  const bundles = [
    {
      key: "selected",
      label: "SELECTED BUNDLE",
      products: selected,
      total: Number(proof.optimization?.total || 0),
      selected: true,
    },
    ...(proof.alternatives || []).map((alternative: any[], index: number) => ({
      key: `alt-${index}`,
      label: `OPTION ${index + 2}`,
      products: alternative,
      total: alternative.reduce((total, product) => total + Number(product.price), 0),
      selected: false,
    })),
  ];

  const rationale = `Selected ${selected.length} product${selected.length === 1 ? "" : "s"} for ${usd(proof.optimization?.total)} inside the ${usd(proof.requirements?.budget)} authorized envelope, preserving ${usd(proof.optimization?.remaining_budget)}. The bundle satisfies ${required.length ? `${requiredSatisfied}/${required.length}` : "all"} required categories and ${passCount} of ${checks.length} deterministic policy checks. No payment has been initiated at this stage.`;

  const alternativeHref = `/workspace?request=${encodeURIComponent(`${proof.requirements?.request} · request a cheaper alternative`)}&budget=${encodeURIComponent(proof.requirements?.budget)}&objective=lowest_cost`;
  const qualityHref = `/workspace?request=${encodeURIComponent(`${proof.requirements?.request} · prioritize product quality`)}&budget=${encodeURIComponent(proof.requirements?.budget)}&objective=highest_quality`;

  return (
    <div className="content dp-page">
      <Link href="/decision-proofs" className="back-link">← Decision Proofs</Link>

      <div className="dp-hero">
        <div>
          <div className="dp-eyebrow">OMNIBUY PROOF ENGINE · <span>{proof.decision_id}</span> · {proof.requirements?.currency} SETTLEMENT</div>
          <h1>Every decision. Explained.<br />Every dollar. Protected.</h1>
          <p>Deterministic verification of price, spec coverage, policy compliance and human authorization before any funds can move.</p>
        </div>
        <div className="dp-hero-stats">
          <div><small>PROOF HASH</small><code>{hash}</code></div>
          <div><small>INTEGRITY</small><b className={proof.integrity_verified ? "ok" : "warn"}>{proof.integrity_verified ? "✓ SHA-256 VERIFIED" : "LEGACY RECORD"}</b></div>
          <div><small>CREATED</small><code>{new Date(proof.created_at).toLocaleString("en-US")}</code></div>
        </div>
      </div>

      <div className="dp-titlebar">
        <div>
          <label>PURCHASE DECISION PROOF</label>
          <h2>{proof.requirements?.request}</h2>
          <p>Target scope: {usd(proof.requirements?.budget)} authorized envelope · {selected.length} selected products · {merchants.length} merchants</p>
        </div>
        <div className="dp-titlebar-right">
          <span className={`detail-status status-${proof.status}`}>{String(proof.status).replaceAll("_", " ")}</span>
          <span className="dp-immutable">🔒 IMMUTABLE RECORD</span>
        </div>
      </div>

      <div className="dp-checkgrid">
        <CheckCard index="01" title="BUDGET CONSTRAINTS" check={check("budget_cap")} value={usd(proof.optimization?.total)} sub={`/ ${usd(proof.requirements?.budget)}`} detail={`Remaining ${usd(proof.optimization?.remaining_budget)}`} />
        <CheckCard index="02" title="PRODUCT SPEC" check={check("required_categories") || satisfied} value={required.length ? `${requiredSatisfied} of ${required.length}` : `${selected.length} selected`} sub="Satisfied" detail={required.length ? required.join(", ") : "No required category envelope"} />
        <CheckCard index="03" title="ITEM CEILING" check={check("max_item_price")} value={usd(maxItem)} sub={`/ ${usd(itemCeiling)}`} detail={check("max_item_price")?.detail || "Per-item ceiling"} />
        <CheckCard index="04" title="MERCHANT TRUST" check={check("merchant_allowlist")} value={check("merchant_allowlist")?.passed ? "PASSED" : "BLOCKED"} sub={`${merchants.length} merchant${merchants.length === 1 ? "" : "s"}`} detail={check("merchant_allowlist")?.detail || "Allowlist evaluated"} />
        <CheckCard index="05" title="AUTH STATUS" check={{ passed: ["approved", "checkout_pending", "completed"].includes(proof.status) }} value={["approved", "checkout_pending", "completed"].includes(proof.status) ? "APPROVED" : blocked || proof.status === "rejected" ? "BLOCKED" : "PENDING"} sub={proof.status === "completed" ? "Captured" : "Human sign-off"} detail={proof.status === "completed" ? "PayPal capture persisted" : "Protocol: explicit supervisor approval"} />
      </div>

      <div className="dp-grid">
        <main>
          <section className="proof-section">
            <div className="section-label">DETERMINISTIC AGENT EXECUTION PIPELINE</div>
            <div className="dp-pipeline">
              {pipeline.map((node, index) => (
                <div className={`dp-node ${node.state}`} key={node.label}>
                  <span className="dp-node-index">NODE {String(index + 1).padStart(2, "0")}</span>
                  <div className="dp-node-body">
                    <b>{node.label}</b>
                    <small>{node.detail || "Recorded"}</small>
                  </div>
                  <div className="dp-node-ref">
                    <code>{node.ref}</code>
                    <em>{node.state === "done" ? "DONE" : node.state === "active" ? "ACTIVE" : node.state === "blocked" ? "BLOCKED" : "QUEUED"}</em>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="proof-section">
            <div className="section-label">CANDIDATE OPTIMIZATION MATRIX</div>
            <p className="fact">Deterministic comparison across the validated bundles. The selected configuration minimizes spend while satisfying the request envelope.</p>
            <div className="dp-table-wrap">
              <table className="dp-table">
                <thead>
                  <tr><th>BUNDLE</th><th>TOTAL</th><th>ITEMS</th><th>MERCHANTS</th><th>RESULT</th></tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => (
                    <tr key={bundle.key} className={bundle.selected ? "selected" : ""}>
                      <td>{bundle.label}</td>
                      <td>{usd(bundle.total)}</td>
                      <td>{bundle.products.length}</td>
                      <td>{Array.from(new Set(bundle.products.map((product: any) => product.merchant))).slice(0, 3).join(" · ")}</td>
                      <td>{bundle.selected ? <span className="dp-pick">AUTONOMOUS PICK</span> : <span className="dp-alt">ALTERNATIVE</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="proof-section">
            <div className="section-label">SELECTED CONFIGURATION</div>
            <div className="dp-products">
              {selected.length ? selected.map((product: any) => (
                <article className="dp-product" key={product.id}>
                  <div className="dp-product-image">{product.image_url ? <img src={product.image_url} alt={product.title} /> : <span>◈</span>}</div>
                  <div className="dp-product-copy">
                    <small>{product.merchant} · {product.availability?.replaceAll("_", " ")}</small>
                    <b>{product.title}</b>
                    <span>{product.brand || product.category} · {product.currency}{product.specifications?.rating_value ? ` · ${product.specifications.rating_value.toFixed(1)}★ (${product.specifications.rating_count})` : " · no buyer rating"}</span>
                  </div>
                  <div className="dp-product-price">
                    <strong>{usd(product.price)}</strong>
                    <a href={product.product_url} target="_blank" rel="noreferrer">Source ↗</a>
                  </div>
                </article>
              )) : <p className="muted">No compliant products were selected.</p>}
            </div>
          </section>

          <section className="proof-section">
            <div className="section-label">DETERMINISTIC RATIONALE</div>
            <div className="dp-rationale">
              <span>✦</span>
              <p>{rationale}</p>
            </div>
          </section>

          <section className="proof-section">
            <div className="section-label">POLICY GUARD CHECKS</div>
            <div className="proof-checks">
              {checks.map((item: any) => (
                <div key={item.name}>
                  <span className={item.passed ? "check-pass" : "check-pending"}>{item.passed ? "✓" : "!"}</span>
                  <div><b>{item.name.replaceAll("_", " ")}</b><small>{item.detail}</small></div>
                  <em>{item.passed ? "PASS" : item.name === "human_approval" ? "PENDING" : "BLOCKED"}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="proof-section">
            <div className="section-label">AUDIT TIMELINE</div>
            <div className="timeline">
              {(proof.workflow_events || []).map((event: any) => (
                <div key={event.type}><span>●</span><div><b>{event.type.replaceAll("_", " ")}</b><small>{event.state || "OmniBuy workflow"}{event.count ? ` · ${event.count} products` : ""}{event.evaluated ? ` · ${event.evaluated} candidates` : ""}</small></div></div>
              ))}
              <div><span>○</span><div><b>human approval</b><small>{["approved", "checkout_pending", "completed"].includes(proof.status) ? `Approved ${proof.approved_at || ""}` : proof.status === "rejected" ? "Rejected by supervisor" : "Required before any payment"}</small></div></div>
            </div>
          </section>
        </main>

        <aside className="proof-side">
          <section className="proof-section dp-control">
            <div className="section-label">DECISION CONTROL</div>
            <p className="fact">Facts are calculated from the live discovery response and server-side policy engine. Approval creates a PayPal Sandbox order; it does not capture funds by itself.</p>
            <div className="side-line"><span>Objective</span><b>{String(proof.requirements?.objective).replaceAll("_", " ")}</b></div>
            <div className="side-line"><span>Currency</span><b>{proof.requirements?.currency}</b></div>
            <div className="side-line"><span>Payment</span><b>PayPal Sandbox</b></div>
            <div className="side-line"><span>Policy snapshot</span><b>{usd(settings.budget_cap || 0)} cap</b></div>
            {error && <div className="policy-alert policy-alert-error">{error}</div>}
            {proof.status === "awaiting_approval" && (
              <div className="decision-actions">
                <button className="run" onClick={approve} disabled={working}>{working ? "Creating secure order…" : "Approve and continue to PayPal →"}</button>
                <button className="reject-button" onClick={reject} disabled={working}>Reject Decision</button>
              </div>
            )}
            {paypal?.links?.find((link: any) => link.rel === "approve")?.href && (
              <a className="run" href={paypal.links.find((link: any) => link.rel === "approve").href}>Open PayPal Sandbox →</a>
            )}
            {paypal && <small className="order-id">Order {paypal.paypal_order_id}</small>}
            {proof.paypal_order_id && !paypal && <div className="side-line"><span>PayPal order</span><b>{proof.paypal_order_id}</b></div>}
            {proof.paypal_capture_id && <div className="side-line"><span>Capture</span><b>{proof.paypal_capture_id}</b></div>}
            {proof.status === "rejected" && <div className="rejected-banner">Decision rejected. No PayPal order can be created from this proof.</div>}
          </section>

          <section className="proof-section">
            <div className="section-label">PROOF INTEGRITY</div>
            <p className="fact">SHA-256 over the immutable decision fields</p>
            <code className="dp-hash">{proof.integrity_hash || "Legacy proof without hash"}</code>
            <div className="side-line"><span>Decision ID</span><b>{proof.decision_id}</b></div>
            <div className="side-line"><span>Created</span><b>{new Date(proof.created_at).toLocaleString("en-US")}</b></div>
            <div className="side-line"><span>Approved</span><b>{proof.approved_at ? new Date(proof.approved_at).toLocaleString("en-US") : "Not yet"}</b></div>
          </section>

          <section className="proof-section">
            <div className="section-label">POLICY SNAPSHOT</div>
            <div className="side-line"><span>Session cap</span><b>{usd(settings.budget_cap || 0)}</b></div>
            <div className="side-line"><span>Item ceiling</span><b>{usd(settings.max_item_price || 0)}</b></div>
            <div className="side-line"><span>Monthly cap</span><b>{usd(settings.monthly_cap || 0)}</b></div>
            <div className="side-line"><span>Restricted</span><b>{(settings.restricted_categories || []).length}</b></div>
          </section>

          <Link className="dp-alt-link" href={alternativeHref}>↻ Re-optimize for lowest cost</Link>
          <Link className="dp-alt-link" href={qualityHref}>✦ Re-optimize for highest quality</Link>
        </aside>
      </div>
    </div>
  );
}

function CheckCard({ index, title, check, value, sub, detail }: { index: string; title: string; check: any; value: string; sub: string; detail: string }) {
  const passed = check?.passed;
  return (
    <article className={`dp-check ${passed ? "pass" : "fail"}`}>
      <div className="dp-check-head"><span>{index}. {title}</span><em>{passed ? "✓ PASSED" : "!"}</em></div>
      <strong>{value} <small>{sub}</small></strong>
      <p>{detail}</p>
    </article>
  );
}
