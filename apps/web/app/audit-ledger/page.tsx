"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const usd = (value: number | string) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Event = {
  event_id: string;
  action: string;
  outcome: string;
  amount: number | null;
  detail: string;
  context: string;
  created_at: string;
};

export default function AuditLedger() {
  const [items, setItems] = useState<any[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch(`${API}/api/decision-proofs`), fetch(`${API}/api/policy/events?limit=12`)])
      .then(async ([proofResponse, eventResponse]) => {
        if (!proofResponse.ok) throw new Error("Could not load the audit ledger");
        setItems(await proofResponse.json());
        if (eventResponse.ok) setEvents(await eventResponse.json());
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const completed = items.filter((item) => item.status === "completed");
  const volume = items.reduce((total, item) => total + Number(item.optimization?.total || 0), 0);
  const captured = items.reduce((total, item) => total + (item.paypal_capture_id ? Number(item.optimization?.total || 0) : 0), 0);

  function exportCsv() {
    const header = "decision_id,status,total,currency,paypal_order_id,paypal_capture_id,created_at";
    const rows = items.map((item) =>
      [item.decision_id, item.status, item.optimization?.total, item.requirements?.currency, item.paypal_order_id || "", item.paypal_capture_id || "", item.created_at]
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "omnibuy-audit-ledger.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="content ledger-page">
      <div className="dp-list-head">
        <div>
          <label>IMMUTABLE AUDIT TRAIL</label>
          <h1>Transactions &amp; Audit History</h1>
          <p>Every proposal, approval, PayPal order, capture and policy evaluation is persisted server-side with its Decision Proof reference.</p>
        </div>
        <button className="al-export" onClick={exportCsv} disabled={items.length === 0}>Export ledger CSV</button>
      </div>

      <div className="dp-list-metrics">
        <div><span>TOTAL PROOFS</span><b>{items.length}</b></div>
        <div><span>COMPLETED CAPTURES</span><b>{completed.length}</b></div>
        <div><span>PROPOSED VOLUME</span><b>{usd(volume)}</b></div>
        <div><span>CAPTURED VOLUME</span><b className="lime-value">{usd(captured)}</b></div>
      </div>

      {error && <div className="discovery-error"><b>Audit ledger unavailable</b><p>{error}</p></div>}

      {items.length === 0 ? (
        <div className="empty"><span>▤</span><div><b>No transactions recorded yet</b><p>Complete a PayPal Sandbox flow to create the first audit record.</p></div><Link href="/workspace">Open workspace →</Link></div>
      ) : (
        <div className="al-table-wrap">
          <table className="al-table">
            <thead>
              <tr>
                <th>DECISION</th>
                <th>REQUEST</th>
                <th>STATUS</th>
                <th>TOTAL</th>
                <th>PAYPAL ORDER</th>
                <th>CAPTURE</th>
                <th>INTEGRITY</th>
                <th>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.decision_id}>
                  <td><Link href={`/decision-proofs/${item.decision_id}`}>{item.decision_id}</Link></td>
                  <td className="al-request">{item.requirements?.request}</td>
                  <td><span className={`session-status ${item.status}`}>{String(item.status).replaceAll("_", " ")}</span></td>
                  <td>{usd(item.optimization?.total || 0)}</td>
                  <td className="al-code">{item.paypal_order_id || "—"}</td>
                  <td className="al-code">{item.paypal_capture_id || "—"}</td>
                  <td className={item.integrity_verified ? "al-ok" : "al-warn"}>{item.integrity_verified ? "✓ SHA-256" : "LEGACY"}</td>
                  <td className="al-code">{new Date(item.created_at).toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="al-events">
        <div className="section-head"><div><label>SECURITY &amp; POLICY EVENTS</label><h2>Recent runtime trace</h2></div><Link href="/policy-guard">Open Policy Guard →</Link></div>
        {events.length === 0 ? (
          <div className="policy-log-empty">No policy events recorded yet.</div>
        ) : (
          <div className="al-event-list">
            {events.map((event) => (
              <div className="al-event" key={event.event_id}>
                <span className={`policy-outcome ${event.outcome}`}>{event.outcome.replaceAll("_", " ")}</span>
                <div><b>{event.action.replaceAll("_", " ")}</b><small>{event.detail || event.context}</small></div>
                <span>{event.amount != null ? usd(event.amount) : "—"}</span>
                <small>{new Date(event.created_at).toLocaleString("en-US")}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
