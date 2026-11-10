"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Checkout() {
  const [state, setState] = useState<"verifying" | "completed" | "error" | "missing">("verifying");
  const [message, setMessage] = useState("Verifying PayPal approval…");
  const [captureId, setCaptureId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get("token") || "";
    setToken(nextToken);
    setOrderId(nextToken);
    if (!nextToken) {
      setState("missing");
      setMessage("No PayPal order token was provided. Start from a Decision Proof approval, then open the PayPal Sandbox link.");
      return;
    }
    fetch(`${API}/api/paypal/orders/${encodeURIComponent(nextToken)}/capture`, { method: "POST" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Capture failed");
        setCaptureId(data.paypal_capture_id);
        setState("completed");
        setMessage("Payment completed. The capture was verified and persisted in the audit ledger.");
      })
      .catch((cause) => {
        setState("error");
        setMessage(cause instanceof Error ? cause.message : String(cause));
      });
  }, []);

  const steps = [
    { label: "Agent decision", detail: "Decision Proof generated", state: "done" },
    { label: "Policy verification", detail: "Deterministic checks passed", state: "done" },
    { label: "PayPal authorization", detail: token ? `Order ${token.slice(0, 10)}…` : "Awaiting buyer", state: token ? "done" : "idle" },
    { label: "Settlement", detail: state === "completed" ? `Capture ${captureId}` : state === "error" ? "Capture failed" : "Server-side capture", state: state === "completed" ? "done" : state === "error" ? "blocked" : "active" },
  ];

  return (
    <div className="content checkout-page">
      <div className="co-head">
        <div>
          <label>PAYPAL CHECKOUT / VERIFIED SETTLEMENT</label>
          <h1>OmniBuy AI ↔ PayPal Sandbox</h1>
          <p>Server-side order creation and capture. The browser never marks a payment successful on its own.</p>
        </div>
        <span className="co-mode">● PayPal Sandbox · Orders v2</span>
      </div>

      <div className="co-grid">
        <section className="co-card">
          <div className="co-stepper">
            {steps.map((step, index) => (
              <div className={`co-step ${step.state}`} key={step.label}>
                <span className="co-step-dot">{step.state === "done" ? "✓" : step.state === "blocked" ? "!" : index + 1}</span>
                <div><small>STEP {String(index + 1).padStart(2, "0")}</small><b>{step.label}</b><em>{step.detail}</em></div>
              </div>
            ))}
          </div>

          <div className={`co-result ${state}`}>
            <span className="co-result-icon">{state === "completed" ? "✓" : state === "error" ? "!" : state === "missing" ? "○" : "◌"}</span>
            <div>
              <b>{state === "completed" ? "Payment captured" : state === "error" ? "Payment could not be completed" : state === "missing" ? "No order token provided" : "Verifying PayPal approval"}</b>
              <p>{message}</p>
              {captureId && <code>Capture ID: {captureId}</code>}
              {orderId && <code>Order ID: {orderId}</code>}
            </div>
          </div>

          <div className="co-actions">
            <Link className="run" href="/audit-ledger">Open Audit Ledger →</Link>
            {state !== "completed" && <Link className="co-secondary" href="/workspace">Return to Agent Workspace</Link>}
          </div>
        </section>

        <aside className="co-side">
          <div className="co-card">
            <div className="section-label">SETTLEMENT GUARANTEES</div>
            <div className="co-guarantee"><span>🔒</span><div><b>Server-side capture</b><small>The API calls PayPal and persists the capture; the UI only renders the result.</small></div></div>
            <div className="co-guarantee"><span>⚖</span><div><b>Policy first</b><small>No PayPal order exists without an approved Decision Proof.</small></div></div>
            <div className="co-guarantee"><span>▤</span><div><b>Auditable</b><small>Order and capture IDs are written to the Decision Proof and audit ledger.</small></div></div>
          </div>
          <div className="co-card">
            <div className="section-label">ENVIRONMENT</div>
            <div className="side-line"><span>Gateway</span><b>PayPal Orders v2</b></div>
            <div className="side-line"><span>Mode</span><b>Sandbox</b></div>
            <div className="side-line"><span>Currency</span><b>USD</b></div>
            <div className="side-line"><span>Idempotency</span><b>PayPal-Request-Id</b></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
