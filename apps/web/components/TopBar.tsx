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
    function syncTheme(event: StorageEvent) {
      if (event.key !== "omnibuy-theme") return;
      const root = document.documentElement;
      if (event.newValue === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    if (next === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("omnibuy-theme", next);
    } catch {
      // storage can be unavailable in private mode; the theme still applies for this page
    }
  }

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
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle light and dark theme"
          title="Toggle light and dark theme"
        >
          <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
          </svg>
          <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
        <Link className="top-icon" href="/audit-ledger" title="Security telemetry">▤</Link>
        <Link className="top-icon" href="/decision-proofs" title={`${pending} decisions awaiting approval`}>◔<i>{pending}</i></Link>
        <Link className="override" href="/policy-guard" title="Emergency override lives in Policy Guard">⚠ Emergency Override</Link>
        <span className="avatar">AD</span>
      </div>
    </header>
  );
}
