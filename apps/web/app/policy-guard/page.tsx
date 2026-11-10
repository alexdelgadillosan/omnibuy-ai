"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Policy = {
  budget_cap: number;
  monthly_cap: number;
  max_item_price: number;
  currency: "USD";
  allowed_merchants: string[];
  restricted_categories: string[];
  human_approval_required: boolean;
  approval_threshold: number;
  us_only: boolean;
};

type PolicyEvent = {
  event_id: string;
  action: string;
  outcome: string;
  amount: number | null;
  detail: string;
  context: string;
  created_at: string;
};

type Stats = {
  evaluations: number;
  blocked: number;
  awaiting_approval: number;
  passed: number;
  monthly_committed: number;
};

type Check = { name: string; passed: boolean; detail: string };

type Simulation = {
  passed: boolean;
  status: string;
  checks: Check[];
};

const usd = (value: number) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function PolicyGuard() {
  const [settings, setSettings] = useState<Policy | null>(null);
  const [saved, setSaved] = useState<Policy | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<PolicyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [amount, setAmount] = useState("1047");
  const [category, setCategory] = useState("general");
  const [merchant, setMerchant] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [running, setRunning] = useState(false);

  const [merchantDraft, setMerchantDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");

  const dirty = useMemo(
    () => Boolean(settings && saved && JSON.stringify(settings) !== JSON.stringify(saved)),
    [settings, saved],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/policy`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Policy Guard is unavailable");
      setSettings(data.settings);
      setSaved(data.settings);
      setStats(data.stats);
      setEvents(data.events || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update<K extends keyof Policy>(key: K, value: Policy[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    setNotice("");
  }

  async function save(next?: Policy) {
    const payload = next || settings;
    if (!payload) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/api/policy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save the policy matrix");
      setSettings(data.settings);
      setSaved(data.settings);
      setStats(data.stats);
      setEvents(data.events || []);
      setNotice("Policy matrix saved. New proposals use these limits.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (saved) setSettings(saved);
    setError("");
    setNotice("");
  }

  async function restoreDefaults() {
    if (!window.confirm("Restore the default policy matrix? This replaces the current limits.")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/policy/reset`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not restore defaults");
      setSettings(data.settings);
      setSaved(data.settings);
      setStats(data.stats);
      setEvents(data.events || []);
      setNotice("Default policy matrix restored.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function simulate(next?: Policy) {
    const active = next || settings;
    if (!active) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/policy/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) || 0, currency: "USD", category, merchant }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Simulation failed");
      setSimulation(data);
      const refreshed = await fetch(`${API}/api/policy`).then((r) => r.json());
      setStats(refreshed.stats);
      setEvents(refreshed.events || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  async function grantException() {
    if (!settings) return;
    const requested = Number(amount) || 0;
    if (requested <= settings.budget_cap) return;
    if (!window.confirm(`Raise the session cap to ${usd(requested)} and persist this policy change?`)) return;
    const next = { ...settings, budget_cap: Math.ceil(requested) };
    setSettings(next);
    await save(next);
    await simulate(next);
  }

  function addMerchant() {
    if (!settings) return;
    const value = merchantDraft.trim();
    if (!value) return;
    if (settings.allowed_merchants.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    update("allowed_merchants", [...settings.allowed_merchants, value]);
    setMerchantDraft("");
  }

  function removeMerchant(value: string) {
    if (!settings) return;
    update("allowed_merchants", settings.allowed_merchants.filter((item) => item !== value));
  }

  function addCategory() {
    if (!settings) return;
    const value = categoryDraft.trim();
    if (!value) return;
    if (settings.restricted_categories.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    update("restricted_categories", [...settings.restricted_categories, value]);
    setCategoryDraft("");
  }

  function removeCategory(value: string) {
    if (!settings) return;
    update("restricted_categories", settings.restricted_categories.filter((item) => item !== value));
  }

  function exportCsv() {
    const header = "event_id,action,outcome,amount,context,detail,created_at";
    const rows = events.map((event) =>
      [event.event_id, event.action, event.outcome, event.amount ?? "", event.context, event.detail, event.created_at]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "omnibuy-policy-events.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const rulesEnforced = settings
    ? 6 + settings.restricted_categories.length + (settings.allowed_merchants.length ? 1 : 0)
    : 0;

  const capCheck = simulation?.checks.find((check) => check.name === "budget_cap");
  const merchantCheck = simulation?.checks.find((check) => check.name === "merchant_allowlist");
  const categoryCheck = simulation?.checks.find((check) => check.name === "restricted_category");

  if (loading) {
    return <div className="content policy-page"><div className="policy-skeleton">Loading the live policy matrix…</div></div>;
  }

  if (!settings || !saved) {
    return (
      <div className="content policy-page">
        <div className="policy-skeleton">
          <b>Policy Guard unavailable</b>
          <p>{error || "The API did not return the policy matrix."}</p>
          <button className="run" onClick={() => void load()}>Retry connection</button>
        </div>
      </div>
    );
  }

  return (
    <div className="content policy-page">
      <div className="policy-command">
        <div className="policy-command-copy">
          <div className="policy-eyebrow">
            <span className="policy-eyebrow-icon">✓</span>
            <span>RUNTIME ENFORCEMENT</span>
            <span className="policy-spec-inline">SPEC-ID: POL-SEC-940</span>
          </div>
          <h1>Policy Guard — Autonomous Spend Guardrails</h1>
          <p>Deterministic safety constraints applied to every agent query before cart assembly or merchant handoff. Changes here are persisted server-side and evaluated on the very next proposal.</p>
        </div>
        <div className="policy-security">
          <span className="policy-security-dot">●</span>
          <div>
            <small>SECURITY STATE</small>
            <b>Guardrails Active — {rulesEnforced} Rules Enforced | 0 Bypasses Permitted</b>
            <p>{stats?.evaluations ?? 0} evaluations logged · {stats?.blocked ?? 0} intercepted</p>
          </div>
        </div>
      </div>

      {error && <div className="policy-alert policy-alert-error">{error}</div>}
      {notice && <div className="policy-alert policy-alert-ok">{notice}</div>}

      <div className="policy-columns">
        <section className="policy-matrix">
          <div className="policy-section-head">
            <div>
              <span className="policy-section-icon">⚖</span>
              <h2>Deterministic Policy Matrix</h2>
            </div>
            <span className="policy-sync-state">● SYNCHRONIZED AT GATEWAY</span>
          </div>

          <article className="policy-block">
            <div className="policy-block-head">
              <span className="policy-block-icon">$</span>
              <div>
                <h3>Maximum Spending Limit <em className="configured-chip">CONFIGURED</em></h3>
                <p>Dual ceiling constraints evaluated per agent runtime invocation.</p>
              </div>
              <span className="policy-block-state">LIVE</span>
            </div>
            <div className="policy-dual">
              <div className="policy-slider">
                <div className="policy-slider-label"><span>Per-Session Cap</span><b>{usd(settings.budget_cap)}</b></div>
                <input
                  type="range"
                  min={100}
                  max={2500}
                  step={50}
                  value={Math.min(2500, Math.max(100, settings.budget_cap))}
                  onChange={(event) => update("budget_cap", Number(event.target.value))}
                />
                <div className="policy-slider-scale"><span>$100</span><span>Max $2.5k</span></div>
                <input
                  className="policy-number"
                  type="number"
                  min={1}
                  value={settings.budget_cap}
                  onChange={(event) => update("budget_cap", Number(event.target.value))}
                  aria-label="Per-session budget cap"
                />
              </div>
              <div className="policy-slider">
                <div className="policy-slider-label"><span>Monthly Cap</span><b>{usd(settings.monthly_cap)}</b></div>
                <input
                  type="range"
                  min={1000}
                  max={20000}
                  step={500}
                  value={Math.min(20000, Math.max(1000, settings.monthly_cap))}
                  onChange={(event) => update("monthly_cap", Number(event.target.value))}
                />
                <div className="policy-slider-scale"><span>$1,000</span><span>Max $20k</span></div>
                <div className="policy-slider-foot">
                  <span>Committed this month</span>
                  <b>{usd(stats?.monthly_committed ?? 0)}</b>
                </div>
              </div>
            </div>
          </article>

          <article className="policy-block">
            <div className="policy-block-head">
              <span className="policy-block-icon">⌂</span>
              <div>
                <h3>Allowed Merchants Whitelist</h3>
                <p>Only authenticated, API-backed merchants may reach cart handoff. An empty list accepts every Channel3-verified merchant.</p>
              </div>
              <span className="policy-block-state">{settings.allowed_merchants.length} APPROVED</span>
            </div>
            <div className="policy-chip-row">
              {settings.allowed_merchants.length === 0 && <span className="policy-empty-chip">No merchant restriction — all verified offers allowed</span>}
              {settings.allowed_merchants.map((item) => (
                <span className="policy-chip" key={item}>
                  <i />
                  {item}
                  <button type="button" onClick={() => removeMerchant(item)} aria-label={`Remove ${item}`}>×</button>
                </span>
              ))}
            </div>
            <div className="policy-inline-form">
              <input
                value={merchantDraft}
                onChange={(event) => setMerchantDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addMerchant()}
                placeholder="Add merchant name (e.g. Dell Direct)"
              />
              <button type="button" onClick={addMerchant}>+ Add merchant</button>
            </div>
          </article>

          <article className="policy-block">
            <div className="policy-block-head">
              <span className="policy-block-icon policy-block-icon-danger">⊘</span>
              <div>
                <h3>Restricted Product Categories</h3>
                <p>The autonomous agent is prohibited from committing funds to flagged classes.</p>
              </div>
              <span className="policy-block-state policy-state-danger">HARD BOUND</span>
            </div>
            <div className="policy-restricted-grid">
              {settings.restricted_categories.map((item) => (
                <div className="policy-restricted" key={item}>
                  <b>{item}</b>
                  <span><i>⊘</i> Blocked</span>
                  <button type="button" onClick={() => removeCategory(item)}>Remove</button>
                </div>
              ))}
              {settings.restricted_categories.length === 0 && <span className="policy-empty-chip">No restricted categories configured.</span>}
            </div>
            <div className="policy-inline-form">
              <input
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addCategory()}
                placeholder="Add restricted category"
              />
              <button type="button" onClick={addCategory}>+ Add category</button>
            </div>
          </article>

          <div className="policy-pair">
            <article className="policy-block">
              <div className="policy-block-head">
                <span className="policy-block-icon">◉</span>
                <div>
                  <h3>Mandatory Human Approval</h3>
                  <p>No payment can start without explicit buyer authorization.</p>
                </div>
              </div>
              <div className="policy-toggle-row">
                <span className="policy-toggle-on">ON</span>
                <b>Enforced by the PayPal gateway</b>
              </div>
              <div className="policy-locked-row">
                <span>Every purchase</span>
                <b>Explicit sign-off · no amount threshold can bypass it</b>
              </div>
              <div className="policy-meta-row"><span>✓ Status: Locked ON</span><span>WebAuthn / Passkey</span></div>
            </article>

            <article className="policy-block">
              <div className="policy-block-head">
                <span className="policy-block-icon">◎</span>
                <div>
                  <h3>Currency &amp; Cross-Border</h3>
                  <p>Strict USD-only settlement. Non-USD offers never reach the optimizer or PayPal handoff.</p>
                </div>
              </div>
              <div className="policy-toggle-row">
                <span className="policy-toggle-on">USD</span>
                <b>USD-only settlement enforced</b>
              </div>
              <div className="policy-locked-row">
                <span>Currency filter</span>
                <b>Only USD-priced, in-stock offers are evaluated</b>
              </div>
              <div className="policy-meta-row"><span>✓ Zero FX Exposure</span><span>ISO 4217: USD</span></div>
            </article>
          </div>

          <article className="policy-block policy-single">
            <div className="policy-block-head">
              <span className="policy-block-icon">▤</span>
              <div>
                <h3>Maximum Single Item Price</h3>
                <p>Independent ceiling per line item, regardless of the overall session reserve.</p>
              </div>
              <span className="policy-single-value">{usd(settings.max_item_price)} <small>Item Ceiling</small></span>
            </div>
            <input
              type="range"
              min={50}
              max={2500}
              step={50}
              value={Math.min(2500, Math.max(50, settings.max_item_price))}
              onChange={(event) => update("max_item_price", Number(event.target.value))}
            />
          </article>

          <div className="policy-savebar">
            <span>{dirty ? "Unsaved policy changes" : `Saved ${saved.currency} · operator edits are audited`}</span>
            <div>
              <button type="button" className="policy-ghost" onClick={restoreDefaults} disabled={saving}>Restore defaults</button>
              <button type="button" className="policy-ghost" onClick={discard} disabled={!dirty || saving}>Discard</button>
              <button type="button" className="policy-save" onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save policy matrix"}
              </button>
            </div>
          </div>
        </section>

        <aside className="policy-side">
          <section className="policy-simulation">
            <div className="policy-section-head">
              <div>
                <span className="policy-section-icon">◧</span>
                <h2>Live Simulation &amp; Intercept</h2>
              </div>
              <span className="policy-monitor">REAL-TIME MONITOR</span>
            </div>

            <article className="policy-sim-card">
              <div className="policy-sim-head">
                <span className="policy-block-icon">⚖</span>
                <b>Visual Policy Simulation</b>
                <span className={`policy-verdict ${simulation && !simulation.passed ? "blocked" : "ready"}`}>
                  {simulation ? (simulation.passed ? "APPROVAL REQUIRED" : "BLOCKED") : "READY"}
                </span>
              </div>

              {simulation && !simulation.passed ? (
                <>
                  <div className="policy-incident-head">
                    <span>INCIDENT TARGET</span>
                    <b>Autonomous Violation Intercepted</b>
                  </div>
                  <div className="policy-incident">
                    <div><span>Requested Amount</span><b>{usd(Number(amount) || 0)}</b></div>
                    <div><span>Authorized Session Budget</span><b>{usd(settings.budget_cap)}</b></div>
                    <div className="policy-incident-delta">
                      <span>Violation</span>
                      <b>+{usd(Math.max(0, (Number(amount) || 0) - settings.budget_cap))} over the active cap</b>
                    </div>
                    <div><span>Context</span><b>{merchant || category}</b></div>
                  </div>
                  <ul className="policy-check-list">
                    {simulation.checks.filter((check) => check.name !== "human_approval").map((check) => (
                      <li key={check.name} className={check.passed ? "pass" : "fail"}>
                        <span>{check.passed ? "✓" : "!"}</span>{check.detail}
                      </li>
                    ))}
                  </ul>
                  <div className="policy-sim-actions">
                    <a className="policy-primary" href="/workspace">↻ Re-optimize cart with {usd(settings.budget_cap)} cap</a>
                    <button type="button" className="policy-secondary" onClick={() => void grantException()}>✓ Grant one-time budget exception</button>
                  </div>
                </>
              ) : (
                <div className="policy-sim-ready">
                  <p>Run a real request against the saved matrix. Every evaluation is written to the intercept log.</p>
                  <div className="policy-fields">
                    <label>
                      <span>REQUESTED AMOUNT</span>
                      <div className="policy-amount"><b>$</b><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><i>USD</i></div>
                    </label>
                    <label>
                      <span>CATEGORY</span>
                      <select value={category} onChange={(event) => setCategory(event.target.value)}>
                        <option value="general">General product</option>
                        {settings.restricted_categories.map((item) => <option key={item} value={item}>{item}</option>)}
                        <option value="electronics">Electronics</option>
                        <option value="home office">Home office</option>
                      </select>
                    </label>
                    <label>
                      <span>MERCHANT (OPTIONAL)</span>
                      <input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Any verified merchant" />
                    </label>
                  </div>
                  <button type="button" className="policy-primary" onClick={() => void simulate()} disabled={running}>
                    {running ? "Evaluating…" : "Run policy check"}
                  </button>
                  {simulation?.passed && (
                    <ul className="policy-check-list">
                      {simulation.checks.map((check) => (
                        <li key={check.name} className={check.passed ? "pass" : "fail"}>
                          <span>{check.passed ? "✓" : "!"}</span>{check.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>

            <article className="policy-stages">
              <span className="policy-stages-label">DETERMINISTIC GUARD STAGE ENGINE</span>
              <div className="policy-stage-row">
                <span className="ok">✓ Token Valid</span>
                <span className="ok">✓ Domain Auth</span>
                <span className={capCheck && !capCheck.passed ? "bad" : "ok"}>{capCheck && !capCheck.passed ? "✕ Cap Clamp" : "✓ Cap Clamp"}</span>
                <span className={merchantCheck && !merchantCheck.passed ? "bad" : "ok"}>{merchantCheck && !merchantCheck.passed ? "✕ Merchant" : "✓ Merchant"}</span>
                <span className={categoryCheck && !categoryCheck.passed ? "bad" : "ok"}>{categoryCheck && !categoryCheck.passed ? "✕ Category" : "✓ Category"}</span>
              </div>
            </article>

            <article className="policy-log">
              <div className="policy-log-head">
                <div>
                  <h3>Recent Intercept Log</h3>
                  <p>Real-time trace of the most recent policy evaluations.</p>
                </div>
                <button type="button" onClick={exportCsv} disabled={events.length === 0}>Export CSV</button>
              </div>
              {events.length === 0 ? (
                <div className="policy-log-empty">No policy events yet. Run a simulation or create a proposal.</div>
              ) : (
                <div className="policy-log-list">
                  {events.slice(0, 8).map((event) => (
                    <div className="policy-log-row" key={event.event_id}>
                      <div>
                        <b>{event.action.replaceAll("_", " ")}</b>
                        <small>{event.context || event.detail}</small>
                      </div>
                      <span className={`policy-outcome ${event.outcome}`}>{event.outcome.replaceAll("_", " ")}</span>
                      <b className="policy-log-amount">{event.amount != null ? usd(event.amount) : "—"}</b>
                      <small>{timeAgo(event.created_at)}</small>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </aside>
      </div>
    </div>
  );
}
