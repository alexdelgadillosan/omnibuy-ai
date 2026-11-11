"use client";

import Link from "next/link";
import { usd } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const prompts = [
  "Build a home office setup under $900",
  "Find the best value fitness essentials",
  "Find a verified gift under $100",
];

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
  category: string;
};

type Proof = {
  decision_id: string;
  status: string;
  created_at: string;
  requirements: { request: string; budget: string; currency: string };
  optimization: { total: string; remaining_budget: string };
  selected_products: Product[];
};

type PolicyInfo = {
  settings: { budget_cap: number; restricted_categories: string[]; allowed_merchants: string[] };
  stats: { evaluations: number; blocked: number };
};


export default function CommandCenter() {
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("900");
  const [objective, setObjective] = useState("best_value");
  const [products, setProducts] = useState<Product[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [policy, setPolicy] = useState<PolicyInfo | null>(null);
  const [query, setQuery] = useState("popular products");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);

  async function discover(nextQuery = query) {
    setLoading(true);
    setError("");
    setQuery(nextQuery);
    try {
      const response = await fetch(`${API}/api/discovery?query=${encodeURIComponent(nextQuery)}&currency=USD`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Product discovery failed");
      setProducts(data.products || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const [proofResponse, policyResponse] = await Promise.all([
      fetch(`${API}/api/decision-proofs`),
      fetch(`${API}/api/policy`),
    ]);
    if (proofResponse.ok) setProofs(await proofResponse.json());
    if (policyResponse.ok) setPolicy(await policyResponse.json());
  }

  useEffect(() => {
    void discover();
    void refresh();
  }, []);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    const intent = request.trim();
    if (intent.length < 3) {
      setError("Describe what you want to buy first.");
      return;
    }
    const budgetNumber = Number(budget);
    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      setError("Enter a maximum budget greater than zero.");
      return;
    }
    setCreating(true);
    setError("");
    setCreated(null);
    try {
      const response = await fetch(`${API}/api/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: intent, budget: Number(budget) || 900, currency: "USD", objective }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The agent could not build a proposal.");
      setCreated(data);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }

  function usePrompt(prompt: string) {
    setRequest(prompt);
    void discover(prompt);
  }

  const rules = policy ? 8 : 0;
  const awaiting = proofs.filter((proof) => proof.status === "awaiting_approval").length;
  const authorized = proofs
    .filter((proof) => ["approved", "checkout_pending"].includes(proof.status))
    .reduce((total, proof) => total + Number(proof.optimization?.total || 0), 0);
  const latest = created?.proof || proofs[0];
  const latestId = latest?.decision_id;

  const pipeline = useMemo(() => {
    const status = latest?.status;
    return [
      { label: "Intent analysis & spec extraction", detail: latest ? latest.requirements.request.slice(0, 62) : "Waiting for a request", state: latest ? "done" : "idle" },
      { label: "Merchant discovery", detail: latest ? `${latest.selected_products.length} selected from live catalog` : "Channel3 merchant graph", state: latest ? "done" : "idle" },
      { label: "Deterministic optimization", detail: latest ? `${usd(latest.optimization.total)} optimized total` : "Pareto frontier ready", state: latest ? "done" : "idle" },
      { label: "Policy Guard verification", detail: status === "blocked" ? "Proposal intercepted" : latest ? "Deterministic checks evaluated" : "Server-side enforcement", state: status === "blocked" ? "blocked" : latest ? "done" : "idle" },
      { label: "Human supervisor approval", detail: ["approved", "checkout_pending", "completed"].includes(status) ? "Approved by supervisor" : status === "rejected" ? "Rejected by supervisor" : "Awaiting decision", state: ["approved", "checkout_pending", "completed"].includes(status) ? "done" : status === "rejected" ? "blocked" : latest ? "active" : "idle" },
      { label: "PayPal settlement", detail: status === "completed" ? "Capture recorded" : status === "checkout_pending" ? "Order created · capture pending" : "Locked until approval", state: status === "completed" ? "done" : status === "checkout_pending" ? "active" : "idle" },
    ] as const;
  }, [latest]);

  return (
    <div className="content command-center">
      <section className="hero cc-hero">
        <label>● AUTONOMOUS ORCHESTRATOR READY</label>
        <h1>What should we <span>buy today?</span></h1>
        <p>Tell OmniBuy what you need. Your AI agent will research, optimize, and verify every purchase before you pay.</p>
        <form className="request-card" onSubmit={run}>
          <textarea
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Build my perfect home office setup under $900 with high ergonomic rating and fast delivery..."
          />
          <div className="toolbar">
            <label className="toolbar-field">
              <span>$ Budget</span>
              <input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" aria-label="Maximum budget" />
            </label>
            <label className="toolbar-field">
              <span>⌁ Priority</span>
              <select value={objective} onChange={(event) => setObjective(event.target.value)}>
                <option value="best_value">Best Value (Spec-Matched)</option>
                <option value="lowest_cost">Lowest Cost</option>
                <option value="highest_quality">Highest Quality</option>
              </select>
            </label>
            <span className="toolbar-static">✓ Merchants: <b>Verified only</b></span>
            <span className="toolbar-static">$ Escrow: <b>PayPal Sandbox</b></span>
          </div>
          <button className="run" type="submit" disabled={creating}>
            {creating ? "Researching live catalog and verifying…" : "▶ Run Autonomous Agent"}
          </button>
          {created && (
            <div className={`cc-result ${created.proof?.status === "blocked" ? "blocked" : ""}`}>
              <b>{created.proof?.status === "blocked" ? "Policy Guard blocked this proposal" : "Decision Proof created"}</b>
              <span>{created.proof?.decision_id} · {usd(created.proof?.optimization?.total || 0)}</span>
              <Link href={`/decision-proofs/${created.proof?.decision_id}`}>Review Decision Proof →</Link>
            </div>
          )}
          {error && <div className="cc-result blocked"><b>Agent run failed</b><span>{error}</span></div>}
        </form>
      </section>

      <section className="suggestions">
        <label>SUGGESTED INTAKES</label>
        {prompts.map((prompt) => (
          <button type="button" onClick={() => usePrompt(prompt)} key={prompt}>
            <span>✦</span><b>{prompt}</b><small>→</small>
          </button>
        ))}
      </section>

      <section className="metrics cc-metrics">
        <Metric label="PRODUCT CATALOG" value={loading ? "…" : String(products.length)} detail="Channel3 verified offers" progress={Math.min(100, products.length * 2.5)} />
        <Metric label="DECISION PROOFS" value={String(proofs.length)} detail={`${awaiting} awaiting approval`} progress={proofs.length ? 100 : 4} />
        <Metric label="POLICY GUARD" value="Active" detail={`${rules} rules · ${policy?.stats.blocked ?? 0} intercepted`} progress={100} />
        <Metric label="PRE-AUTH POOL" value={usd(authorized)} detail="Approved · awaiting capture" progress={authorized > 0 ? 72 : 4} />
      </section>

      <div className="cc-lower">
        <section className="cc-sessions">
          <div className="section-head">
            <div><label>RECENT PURCHASING SESSIONS</label><h2>Decision ledger</h2></div>
            <span className="live-sync">● Persisted records</span>
          </div>
          {proofs.length === 0 ? (
            <div className="empty"><span>◈</span><div><b>No sessions yet</b><p>Run the agent to create the first verified Decision Proof.</p></div></div>
          ) : (
            <div className="session-list">
              {proofs.slice(0, 4).map((proof) => (
                <Session key={proof.decision_id} proof={proof} />
              ))}
            </div>
          )}
        </section>

        <aside className="cc-telemetry">
          <div className="section-head"><div><label>ACTIVE TELEMETRY</label><h2>System status</h2></div><span className="live-sync">● Latest load</span></div>
          <div className="telemetry-card">
            <TelemetryRow icon="⌕" label="Channel3 Discovery" value={loading ? "Searching" : `${products.length} offers`} detail="Verified product graph" />
            <TelemetryRow icon="✦" label="Agent Gateway" value="Online" detail="Deterministic pipeline" />
            <TelemetryRow icon="$" label="PayPal Sandbox" value="Ready" detail="Orders v2 · capture server-side" />
            <TelemetryRow icon="⚖" label="Policy Guard" value="Enforcing" detail={`${rules} active rules`} />
          </div>

          <div className="section-head pipeline-head"><div><label>LIVE AGENT PIPELINE</label><h2>{latestId || "No active session"}</h2></div></div>
          <div className="pipeline-card">
            {pipeline.map((step, index) => (
              <div className={`pipeline-step ${step.state}`} key={step.label}>
                <span className="pipeline-dot">{step.state === "done" ? "✓" : step.state === "blocked" ? "!" : step.state === "active" ? "●" : index + 1}</span>
                <div><b>{step.label}</b><small>{step.detail}</small></div>
              </div>
            ))}
            {latestId && <Link className="pipeline-link" href={`/decision-proofs/${latestId}`}>Open full Decision Proof →</Link>}
          </div>
        </aside>
      </div>

      <section className="catalog-section">
        <div className="section-head">
          <div><label>PRODUCT DISCOVERY RESULTS</label><h2>{query}</h2></div>
          <Link href="/workspace">Open Agent Workspace →</Link>
        </div>
        {error && !products.length ? (
          <div className="discovery-error"><b>Discovery unavailable</b><p>{error}</p></div>
        ) : loading ? (
          <div className="catalog-loading">Querying Channel3 product graph…</div>
        ) : products.length === 0 ? (
          <div className="empty"><span>◈</span><div><b>No live products matched</b><p>Try a broader shopping request.</p></div></div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {product.image_url ? <img src={product.image_url} alt={product.title} /> : <span>◈</span>}
                </div>
                <div className="product-card-body">
                  <small>{product.merchant}</small>
                  <h3>{product.title}</h3>
                  <strong>{usd(product.price)}</strong>
                  <span className={product.availability === "out_of_stock" ? "out-stock" : "in-stock"}>
                    {product.availability.replaceAll("_", " ")}
                  </span>
                  <a href={product.product_url} target="_blank" rel="noreferrer">View at merchant ↗</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, progress }: { label: string; value: string; detail: string; progress: number }) {
  return (
    <article>
      <label>{label}</label>
      <strong>{value}</strong>
      <small>{detail}</small>
      <div className="metric-bar"><span style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} /></div>
    </article>
  );
}

function Session({ proof }: { proof: Proof }) {
  const total = Number(proof.optimization?.total || 0);
  const budget = Number(proof.requirements?.budget || 0);
  const savings = Math.max(0, budget - total);
  const merchants = Array.from(new Set((proof.selected_products || []).map((product) => product.merchant))).slice(0, 3);
  return (
    <article className="session-card">
      <div className="session-top">
        <div>
          <b>{proof.requirements?.request?.slice(0, 58) || "Purchase decision"}</b>
          <small>{proof.decision_id} · {proof.selected_products?.length || 0} selected products</small>
        </div>
        <span className={`session-status ${proof.status}`}>{proof.status.replaceAll("_", " ")}</span>
      </div>
      <div className="session-numbers">
        <div><span>TARGET BUDGET</span><b>{usd(budget)}</b></div>
        <div><span>OPTIMIZED SPEND</span><b>{usd(total)}</b></div>
        <div><span>REMAINING</span><b className="lime">+{usd(savings)}</b></div>
      </div>
      <div className="session-foot">
        <span>{merchants.length ? merchants.join(" · ") : "No merchant selected"}</span>
        <Link href={`/decision-proofs/${proof.decision_id}`}>Review Decision Proof →</Link>
      </div>
    </article>
  );
}

function TelemetryRow({ icon, label, value, detail }: { icon: string; label: string; value: string; detail: string }) {
  return (
    <div className="telemetry-row">
      <span className="telemetry-icon">{icon}</span>
      <div><b>{label}</b><small>{detail}</small></div>
      <em>{value}</em>
    </div>
  );
}
