"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const usd = (value: number | string) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProofsPage() {
  return (
    <Suspense fallback={<div className="content dp-list-page" />}>
      <Proofs />
    </Suspense>
  );
}

function Proofs() {
  const params = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(params.get("q") || "");
  }, [params]);

  useEffect(() => {
    fetch(`${API}/api/decision-proofs`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load Decision Proofs");
        setItems(await response.json());
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.decision_id, item.requirements?.request, item.status].join(" ").toLowerCase().includes(term),
    );
  }, [items, query]);

  const awaiting = items.filter((item) => item.status === "awaiting_approval").length;
  const approved = items.filter((item) => ["approved", "checkout_pending", "completed"].includes(item.status)).length;
  const value = items.reduce((total, item) => total + Number(item.optimization?.total || 0), 0);

  return (
    <div className="content dp-list-page">
      <div className="dp-list-head">
        <div>
          <label>VERIFIED DECISIONS</label>
          <h1>Decision Proofs</h1>
          <p>Every proposal, policy check and approval is persisted with an integrity hash over the immutable decision fields.</p>
        </div>
        <Link className="deploy-agent" href="/workspace">✦ Start a new proof</Link>
      </div>

      <div className="dp-list-metrics">
        <div><span>TOTAL PROOFS</span><b>{items.length}</b></div>
        <div><span>AWAITING APPROVAL</span><b>{awaiting}</b></div>
        <div><span>APPROVED / PAID</span><b>{approved}</b></div>
        <div><span>PROPOSED VALUE</span><b>{usd(value)}</b></div>
      </div>

      <div className="dp-list-toolbar">
        <div className="search dp-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by decision ID, request or status…" />
        </div>
        <span className="live-sync">● Live sync · {filtered.length} records</span>
      </div>

      {error && <div className="discovery-error"><b>Ledger unavailable</b><p>{error}</p></div>}

      {filtered.length === 0 ? (
        <div className="empty"><span>✓</span><div><b>No Decision Proofs match</b><p>Run the agent in Agent Workspace to create the first verified proposal.</p></div><Link href="/workspace">Open workspace →</Link></div>
      ) : (
        <div className="dp-list">
          {filtered.map((item) => (
            <article className="dp-row" key={item.decision_id}>
              <div className="dp-row-main">
                <b>{item.requirements?.request || "Purchase decision"}</b>
                <small>{item.decision_id} · {new Date(item.created_at).toLocaleString("en-US")}</small>
              </div>
              <div className="dp-row-metric"><span>CANDIDATES</span><b>{item.evaluated_candidates}</b></div>
              <div className="dp-row-metric"><span>SELECTED</span><b>{item.selected_products?.length || 0}</b></div>
              <div className="dp-row-metric"><span>TOTAL</span><b>{usd(item.optimization?.total || 0)}</b></div>
              <span className={`session-status ${item.status}`}>{String(item.status).replaceAll("_", " ")}</span>
              <span className={`dp-integrity ${item.integrity_verified ? "ok" : "legacy"}`}>{item.integrity_verified ? "✓ SHA-256" : "LEGACY"}</span>
              <Link href={`/decision-proofs/${item.decision_id}`}>Open →</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
