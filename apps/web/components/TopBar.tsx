"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function TopBar() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/decision-proofs`)
      .then((response) => (response.ok ? response.json() : []))
      .then((items: any[]) => {
        setPending(items.filter((item) => item.status === "awaiting_approval").length);
      })
      .catch(() => undefined);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(`/decision-proofs?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="topbar">
      <label htmlFor="nav-toggle" className="nav-menu" aria-label="Open navigation" title="Open navigation">☰</label>
      <form className="search" onSubmit={submit}>
        <span>⌕</span>
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search decision proofs by ID, request or status..."
          aria-label="Search decision proofs"
        />
        <kbd>⌘ K</kbd>
      </form>
      <div className="top-actions">
        <Link className="top-icon" href="/audit-ledger" title="Security telemetry">▤</Link>
        <Link className="top-icon" href="/decision-proofs" title={`${pending} decisions awaiting approval`}>◔<i>{pending}</i></Link>
        <Link className="override" href="/policy-guard" title="Emergency override lives in Policy Guard">⚠ Emergency Override</Link>
        <span className="avatar">AD</span>
      </div>
    </header>
  );
}
